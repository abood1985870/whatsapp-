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
      return { status: response.data.instance.state, phoneNumber: response.data.instance.ownerJid }; 
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
    await firstValueFrom(this.httpService.post(`${this.baseUrl}/webhook/set/${input.instanceId}`, {
      enabled: true,
      url: input.url,
      webhookByEvents: false,
      webhookBase64: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"]
    }, { headers: { apikey: this.apiKey } }));
  }

  async getMediaBuffer(instanceId: string, messageId: string): Promise<Buffer> {
    // Mock implementation for media download
    return Buffer.from("mock-media-buffer", "utf-8");
  }

  async validateWebhook(input: unknown, headers: any): Promise<ValidatedWebhookEvent | null> {
    try { 
      if (!this.isValidSignature(input, headers)) {
        this.logger.warn("Rejected Evolution webhook with invalid signature");
        return null;
      }

      const payload = input as any; 
      if (!payload.data?.key?.remoteJid) return null; 
      return { 
        eventType: payload.event, 
        phoneNumber: payload.data.key.remoteJid.replace(/@.*/, ""), 
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

  private isValidSignature(input: unknown, headers: any): boolean {
    if (!config.EVOLUTION_WEBHOOK_SECRET) return true;

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
}
