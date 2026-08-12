import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "@qanoai/config";
import {
  AnswerInstruction,
  AvailableNumber,
  ProviderHealth,
  ValidatedCallWebhook,
  VoiceCapabilityFlag,
  VoiceProvider,
} from "./voice-provider.interface";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

/**
 * Twilio Programmable Voice + Media Streams adapter.
 *
 * Status is CONFIGURATION_REQUIRED until credentials exist AND a real API
 * round-trip succeeds — see docs/AI_VOICE_EXTERNAL_SETUP_REQUIRED.md. This
 * adapter never reports LIVE_VERIFIED on the presence of env vars alone.
 */
@Injectable()
export class TwilioVoiceProvider implements VoiceProvider {
  readonly id = "TWILIO";
  private readonly logger = new Logger(TwilioVoiceProvider.name);

  getCapabilities(): VoiceCapabilityFlag[] {
    return [
      "EXISTING_NUMBER",
      "NEW_NUMBER",
      "SIP",
      "CALL_FORWARDING",
      "MEDIA_STREAMING",
      "BIDIRECTIONAL_AUDIO",
      "RECORDING",
      "DTMF",
      "CALLER_ID",
      "WEBHOOK_SIGNATURE",
      "CONCURRENT_CALLS",
    ];
  }

  validateConfiguration() {
    const missing: string[] = [];
    if (!config.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
    if (!config.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
    if (!config.VOICE_PUBLIC_BASE_URL) missing.push("VOICE_PUBLIC_BASE_URL");
    return { configured: missing.length === 0, missing };
  }

  async getHealth(): Promise<ProviderHealth> {
    const { configured, missing } = this.validateConfiguration();
    if (!configured) {
      return {
        status: "CONFIGURATION_REQUIRED",
        checkedAt: new Date(),
        detail: `إعدادات ناقصة: ${missing.join(", ")}`,
      };
    }
    try {
      const response = await fetch(`${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}.json`, {
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        return {
          status: response.status === 401 ? "CONFIGURATION_REQUIRED" : "ERROR",
          checkedAt: new Date(),
          detail: `Twilio API ${response.status}`,
        };
      }
      return { status: "LIVE_VERIFIED", checkedAt: new Date() };
    } catch (error: any) {
      return { status: "ERROR", checkedAt: new Date(), detail: this.safeError(error) };
    }
  }

  async listAvailableNumbers(countryCode: string): Promise<AvailableNumber[]> {
    this.requireConfigured();
    const response = await fetch(
      `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/${encodeURIComponent(countryCode)}/Local.json?VoiceEnabled=true&PageSize=20`,
      { headers: { Authorization: this.authHeader() }, signal: AbortSignal.timeout(15000) }
    );
    if (!response.ok) throw new Error(`TWILIO_LIST_NUMBERS_${response.status}`);
    const data: any = await response.json();
    return (data.available_phone_numbers ?? []).map((n: any) => ({
      phoneNumber: n.phone_number,
      countryCode: n.iso_country ?? countryCode,
      region: n.region ?? n.locality ?? undefined,
      capabilities: this.getCapabilities(),
    }));
  }

  async provisionNumber(phoneNumber: string): Promise<{ providerNumberId: string }> {
    this.requireConfigured();
    const body = new URLSearchParams({
      PhoneNumber: phoneNumber,
      VoiceUrl: `${config.VOICE_PUBLIC_BASE_URL}/v1/voice/webhooks/twilio/incoming`,
      VoiceMethod: "POST",
      StatusCallback: `${config.VOICE_PUBLIC_BASE_URL}/v1/voice/webhooks/twilio/status`,
      StatusCallbackMethod: "POST",
    });
    const response = await fetch(`${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`TWILIO_PROVISION_${response.status}`);
    const data: any = await response.json();
    return { providerNumberId: data.sid };
  }

  async releaseNumber(providerNumberId: string): Promise<void> {
    this.requireConfigured();
    const response = await fetch(
      `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${providerNumberId}.json`,
      { method: "DELETE", headers: { Authorization: this.authHeader() }, signal: AbortSignal.timeout(15000) }
    );
    if (!response.ok && response.status !== 404) throw new Error(`TWILIO_RELEASE_${response.status}`);
  }

  /**
   * Twilio signs `fullUrl + concat(sortedParamKey + paramValue)` with
   * HMAC-SHA1 keyed by the auth token, base64-encoded, in X-Twilio-Signature.
   * An unsigned or mismatched request yields null and MUST be rejected —
   * caller id and call status are never trusted from an unverified body.
   */
  validateWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, unknown>,
    fullUrl: string
  ): ValidatedCallWebhook | null {
    const authToken = config.TWILIO_AUTH_TOKEN;
    if (!authToken) return null;

    const signature = this.headerValue(headers, "x-twilio-signature");
    if (!signature) return null;

    const sortedKeys = Object.keys(payload).sort();
    let data = fullUrl;
    for (const key of sortedKeys) data += key + String(payload[key] ?? "");

    const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
    if (!this.constantTimeEquals(expected, signature)) {
      this.logger.warn("Rejected Twilio webhook with invalid signature");
      return null;
    }

    const callSid = String(payload.CallSid ?? "");
    if (!callSid) return null;

    const callStatus = payload.CallStatus ? String(payload.CallStatus) : undefined;
    let eventType: ValidatedCallWebhook["eventType"] = "UNKNOWN";
    if (payload.Digits !== undefined) eventType = "DTMF";
    else if (payload.RecordingSid !== undefined) eventType = "RECORDING";
    else if (callStatus === "ringing" || callStatus === "in-progress") eventType = "INCOMING_CALL";
    else if (callStatus) eventType = "CALL_STATUS";

    return {
      providerCallId: callSid,
      // Twilio has no separate event id; the status makes each event distinct.
      providerEventId: callStatus ? `${callSid}:${callStatus}` : undefined,
      eventType,
      fromNumber: String(payload.From ?? ""),
      toNumber: String(payload.To ?? ""),
      callStatus,
      digits: payload.Digits ? String(payload.Digits) : undefined,
      raw: payload,
    };
  }

  buildAnswerInstruction(input: { streamUrl: string; streamToken: string; greeting?: string }): AnswerInstruction {
    // <Connect><Stream> is bidirectional: Twilio sends 8kHz mulaw frames and
    // plays back whatever we write to the same socket.
    const greeting = input.greeting
      ? `<Say language="ar-SA">${this.escapeXml(input.greeting)}</Say>`
      : "";
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>${greeting}<Connect>` +
      `<Stream url="${this.escapeXml(input.streamUrl)}">` +
      `<Parameter name="token" value="${this.escapeXml(input.streamToken)}"/>` +
      `</Stream></Connect></Response>`;
    return { contentType: "text/xml", body };
  }

  buildRejectInstruction(reason: string, spokenMessage?: string): AnswerInstruction {
    const say = spokenMessage ? `<Say language="ar-SA">${this.escapeXml(spokenMessage)}</Say>` : "";
    return {
      contentType: "text/xml",
      body: `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Hangup/></Response>`,
    };
  }

  async endCall(providerCallId: string): Promise<void> {
    this.requireConfigured();
    await fetch(`${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/Calls/${providerCallId}.json`, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Status: "completed" }),
      signal: AbortSignal.timeout(10000),
    });
  }

  async getCallStatus(providerCallId: string) {
    this.requireConfigured();
    const response = await fetch(
      `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/Calls/${providerCallId}.json`,
      { headers: { Authorization: this.authHeader() }, signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return null;
    const data: any = await response.json();
    // `price` is only present once Twilio has finalized billing; when it is
    // absent we return undefined rather than guessing a cost.
    const priceMinor =
      data.price !== null && data.price !== undefined
        ? Math.round(Math.abs(parseFloat(data.price)) * 100)
        : undefined;
    return {
      status: String(data.status),
      durationSeconds: data.duration ? parseInt(data.duration, 10) : undefined,
      costMinor: priceMinor,
    };
  }

  async startRecording(providerCallId: string): Promise<{ recordingId: string }> {
    this.requireConfigured();
    const response = await fetch(
      `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/Calls/${providerCallId}/Recordings.json`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ RecordingChannels: "dual" }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!response.ok) throw new Error(`TWILIO_RECORDING_START_${response.status}`);
    const data: any = await response.json();
    return { recordingId: data.sid };
  }

  async stopRecording(providerCallId: string, recordingId: string): Promise<void> {
    this.requireConfigured();
    await fetch(
      `${TWILIO_API}/Accounts/${config.TWILIO_ACCOUNT_SID}/Calls/${providerCallId}/Recordings/${recordingId}.json`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Status: "stopped" }),
        signal: AbortSignal.timeout(10000),
      }
    );
  }

  private requireConfigured() {
    const { configured, missing } = this.validateConfiguration();
    if (!configured) throw new Error(`TWILIO_CONFIGURATION_REQUIRED:${missing.join(",")}`);
  }

  private authHeader(): string {
    const raw = `${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`;
    return `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  private headerValue(headers: Record<string, unknown>, name: string): string | undefined {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name) return Array.isArray(value) ? String(value[0]) : String(value);
    }
    return undefined;
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /** Never leak credentials or full request bodies into logs. */
  private safeError(error: any): string {
    return String(error?.message ?? "UNKNOWN_ERROR").slice(0, 200);
  }
}
