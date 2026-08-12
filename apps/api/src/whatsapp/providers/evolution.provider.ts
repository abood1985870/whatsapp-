import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { config } from "@qanoai/config";
import { createHmac, timingSafeEqual } from "crypto";
import { WhatsAppProvider, CreateInstanceInput, QrCodeResult, ConnectionState, SendTextInput, SendTemplateInput, SendMediaInput, SetWebhookInput, ProviderMessageResult, ValidatedWebhookEvent } from "./whatsapp-provider.interface";

@Injectable()
export class EvolutionProvider implements WhatsAppProvider {
  private readonly logger = new Logger(EvolutionProvider.name);
  private readonly baseUrl: string = config.EVOLUTION_API_URL || "";
  private readonly apiKey: string = config.EVOLUTION_API_KEY || "";
  
  constructor(private readonly httpService: HttpService) {}
  
  async createInstance(input: CreateInstanceInput): Promise<{ instanceId: string }> {
    // Evolution API v2 rejects creation without an explicit integration type
    const response = await firstValueFrom(this.httpService.post(`${this.baseUrl}/instance/create`, { instanceName: input.name, integration: "WHATSAPP-BAILEYS", qrcode: true }, { headers: { apikey: this.apiKey } }));
    return { instanceId: response.data.instance.instanceName };
  }
  
  async requestQrCode(instanceId: string): Promise<QrCodeResult> {
    const response = await firstValueFrom(this.httpService.get(`${this.baseUrl}/instance/connect/${instanceId}`, { headers: { apikey: this.apiKey } }));
    return { qrCode: response.data.base64, instanceId, expiresAt: new Date(Date.now() + 60000) };
  }
  
  async getConnectionState(instanceId: string): Promise<ConnectionState> {
    try { 
      const response = await firstValueFrom(this.httpService.get(`${this.baseUrl}/instance/connectionState/${instanceId}`, { headers: { apikey: this.apiKey } })); 
      const rawStatus = response.data.instance?.state;
      return { status: this.normalizeConnectionStatus(rawStatus), phoneNumber: response.data.instance?.ownerJid, rawStatus };
    } catch (error: any) { 
      return { status: "ERROR", error: error.message }; 
    }
  }
  
  async disconnect(instanceId: string): Promise<void> { 
    await firstValueFrom(this.httpService.delete(`${this.baseUrl}/instance/logout/${instanceId}`, { headers: { apikey: this.apiKey } })); 
  }
  
  async reconnect(instanceId: string): Promise<void> { 
    await this.requestQrCode(instanceId); 
  }
  
  async deleteInstance(instanceId: string): Promise<void> { 
    await firstValueFrom(this.httpService.delete(`${this.baseUrl}/instance/delete/${instanceId}`, { headers: { apikey: this.apiKey } })); 
  }
  
  async sendText(input: SendTextInput): Promise<ProviderMessageResult> {
    const response = await firstValueFrom(this.httpService.post(`${this.baseUrl}/message/sendText/${input.instanceId}`, { number: input.phoneNumber, text: input.text }, { headers: { apikey: this.apiKey } }));
    return { messageId: response.data.key?.id || "unknown", status: "SENT" };
  }

  async sendTemplate(input: SendTemplateInput): Promise<ProviderMessageResult> {
    const response = await firstValueFrom(this.httpService.post(`${this.baseUrl}/message/sendText/${input.instanceId}`, { number: input.phoneNumber, text: `[Template: ${input.templateName}]` }, { headers: { apikey: this.apiKey } }));
    return { messageId: response.data.key?.id || "unknown", status: "SENT" };
  }

  async sendMedia(input: SendMediaInput): Promise<ProviderMessageResult> {
    const response = await firstValueFrom(this.httpService.post(`${this.baseUrl}/message/sendMedia/${input.instanceId}`, {
      number: input.phoneNumber,
      mediatype: input.mediaType,
      mimetype: input.mimeType || "application/octet-stream",
      media: input.url,
      caption: input.caption || "",
      fileName: input.fileName || "media"
    }, { headers: { apikey: this.apiKey } }));
    return { messageId: response.data.key?.id || "unknown", status: "SENT" };
  }

  async setWebhook(input: SetWebhookInput): Promise<void> {
    const webhookUrl = config.EVOLUTION_WEBHOOK_SECRET
      ? this.appendSecretToWebhookUrl(input.url, config.EVOLUTION_WEBHOOK_SECRET)
      : input.url;

    await firstValueFrom(this.httpService.post(`${this.baseUrl}/webhook/set/${input.instanceId}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"]
      }
    }, { headers: { apikey: this.apiKey } }));
  }

  async getMediaBuffer(instanceId: string, messageId: string): Promise<Buffer> {
    // Mock implementation for media download
    return Buffer.from("mock-media-buffer", "utf-8");
  }

  /**
   * Public signature check, so callers can verify BEFORE dispatching on event
   * type and cannot accidentally act on an unauthenticated payload.
   */
  hasValidSignature(input: unknown, headers: any, query?: any): boolean {
    return this.isValidSignature(input, headers, query);
  }

  async validateWebhook(input: unknown, headers: any, query?: any): Promise<ValidatedWebhookEvent | null> {
    try {
      if (!this.isValidSignature(input, headers, query)) {
        this.logger.warn("Rejected Evolution webhook with invalid signature");
        return null;
      }

      const payload = input as any; 
      const connectionEvent = this.parseConnectionUpdate(payload);
      if (connectionEvent) return connectionEvent;
      if (payload?.data?.key?.fromMe) return null;

      const phoneNumber = this.extractPhoneNumber(payload);
      if (!phoneNumber) return null; 
      return { 
        eventType: payload.event, 
        phoneNumber,
        pushName: payload.data?.pushName || payload.pushName,
        message: { 
          id: payload.data.key.id, 
          text: payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text, 
          type: payload.data.messageType || "TEXT", 
          timestamp: payload.data.messageTimestamp 
        }, 
        instanceId: payload.instance 
      }; 
    } catch { 
      return null; 
    }
  }

  private extractPhoneNumber(payload: any): string | undefined {
    const key = payload?.data?.key;
    if (!key) return undefined;

    const remoteJid = String(key.remoteJid || "");
    const remoteJidAlt = String(key.remoteJidAlt || "");
    const preferredJid = remoteJidAlt.includes("@s.whatsapp.net") || remoteJid.endsWith("@lid")
      ? remoteJidAlt
      : remoteJid;

    const phoneNumber = preferredJid.replace(/@.*/, "");
    return phoneNumber || undefined;
  }

  private isValidSignature(input: unknown, headers: any, query?: any): boolean {
    // Fail CLOSED. An unset secret previously accepted every unsigned request,
    // which left the public webhook endpoint open to anyone who knew the URL.
    if (!config.EVOLUTION_WEBHOOK_SECRET) {
      this.logger.error(
        "EVOLUTION_WEBHOOK_SECRET is not set - rejecting webhook. " +
        "Set it in the environment and re-register the webhook, or inbound WhatsApp will not be processed."
      );
      return false;
    }

    const webhookSecret = String(headers?.["x-evolution-secret"] || "");
    if (webhookSecret && this.safeCompare(webhookSecret, config.EVOLUTION_WEBHOOK_SECRET)) return true;

    // The query-string branch is gone. Accepting the shared secret as ?secret=
    // put it in the webhook URL, which means it lands in the provider's stored
    // configuration, in proxy access logs, and in any error report that quotes
    // the request line. A secret that travels in a URL is a secret with a much
    // larger blast radius than a header. Registration uses the header.

    const provided = String(
      headers?.["x-evolution-signature"] ||
      headers?.["x-hub-signature-256"] ||
      headers?.["x-signature"] ||
      ""
    ).replace(/^sha256=/, "");

    if (!provided) return false;

    const expected = createHmac("sha256", config.EVOLUTION_WEBHOOK_SECRET)
      .update(JSON.stringify(input))
      .digest("hex");

    const providedBuffer = Buffer.from(provided, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
  }

  private safeCompare(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
  }

  private parseConnectionUpdate(payload: any): ValidatedWebhookEvent | null {
    const eventName = String(payload?.event || "").toUpperCase().replace(/\./g, "_");
    if (eventName !== "CONNECTION_UPDATE") return null;

    const rawStatus = payload?.data?.state || payload?.data?.status || payload?.data?.connection || payload?.instance?.state;
    const instanceId = payload?.instance || payload?.data?.instanceName || payload?.instanceName;
    if (!instanceId || !rawStatus) return null;

    const phoneNumber = payload?.data?.ownerJid || payload?.data?.phoneNumber || payload?.data?.number;
    return {
      eventType: "CONNECTION_UPDATE",
      instanceId,
      connectionState: {
        status: this.normalizeConnectionStatus(rawStatus),
        rawStatus,
        phoneNumber: phoneNumber ? String(phoneNumber).replace(/@.*/, "") : undefined,
      },
    };
  }

  private normalizeConnectionStatus(status: string | undefined): string {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "open") return "CONNECTED";
    if (normalized === "connecting") return "CONNECTING";
    if (normalized === "close" || normalized === "closed") return "DISCONNECTED";
    if (normalized === "refused") return "ERROR";
    return status || "UNKNOWN";
  }

  private appendSecretToWebhookUrl(url: string, secret: string): string {
    const parsed = new URL(url);
    parsed.searchParams.set("secret", secret);
    return parsed.toString();
  }
}
