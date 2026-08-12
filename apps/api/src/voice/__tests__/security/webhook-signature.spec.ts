import { createHmac } from "crypto";

const AUTH_TOKEN = "test-twilio-auth-token";
const URL = "https://example.com/v1/voice/webhooks/twilio/incoming";

// @qanoai/config validates and freezes process.env at import time, so the
// adapter's credentials have to be supplied through the module itself.
jest.mock("@qanoai/config", () => ({
  config: {
    TWILIO_AUTH_TOKEN: "test-twilio-auth-token",
    TWILIO_ACCOUNT_SID: undefined,
    VOICE_PUBLIC_BASE_URL: undefined,
    AUTH_SECRET: "unit-test-secret-at-least-32-characters-long",
    VOICE_STREAM_TOKEN_SECRET: undefined,
  },
}));

import { TwilioVoiceProvider } from "../../providers/twilio-voice.provider";
import { StreamTokenService } from "../../stream-token.service";

function sign(params: Record<string, string>, url = URL, token = AUTH_TOKEN): string {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  return createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
}

describe("Twilio webhook signature verification", () => {
  const provider = new TwilioVoiceProvider();
  const params = { CallSid: "CA123", From: "+966501234567", To: "+966555000111", CallStatus: "ringing" };

  it("accepts a correctly signed request", () => {
    const event = provider.validateWebhook(params, { "x-twilio-signature": sign(params) }, URL);
    expect(event).not.toBeNull();
    expect(event?.providerCallId).toBe("CA123");
    expect(event?.eventType).toBe("INCOMING_CALL");
  });

  it("rejects a request with no signature header", () => {
    expect(provider.validateWebhook(params, {}, URL)).toBeNull();
  });

  it("rejects a forged signature", () => {
    expect(provider.validateWebhook(params, { "x-twilio-signature": "bogus" }, URL)).toBeNull();
  });

  it("rejects a signature computed with the wrong auth token", () => {
    const forged = sign(params, URL, "attacker-token");
    expect(provider.validateWebhook(params, { "x-twilio-signature": forged }, URL)).toBeNull();
  });

  it("rejects when a parameter was tampered with after signing", () => {
    const signature = sign(params);
    const tampered = { ...params, From: "+966500000000" };
    expect(provider.validateWebhook(tampered, { "x-twilio-signature": signature }, URL)).toBeNull();
  });

  it("rejects a valid signature replayed against a different URL", () => {
    const signature = sign(params);
    expect(
      provider.validateWebhook(params, { "x-twilio-signature": signature }, "https://evil.example/v1/voice/webhooks/twilio/incoming")
    ).toBeNull();
  });

  it("never reports LIVE_VERIFIED from configuration alone", async () => {
    // Account SID and public base URL are absent in the mocked config.
    const health = await provider.getHealth();
    expect(health.status).toBe("CONFIGURATION_REQUIRED");
  });
});

describe("media stream token", () => {
  const tokens = new StreamTokenService();

  it("accepts a freshly issued token once", () => {
    const token = tokens.issue("call_1");
    const first = tokens.verify(token);
    expect(first).toMatchObject({ valid: true, callId: "call_1" });
  });

  it("refuses to accept the same token twice (single use)", () => {
    const token = tokens.issue("call_2");
    expect(tokens.verify(token).valid).toBe(true);
    expect(tokens.verify(token)).toMatchObject({ valid: false, reason: "ALREADY_USED" });
  });

  it("rejects a tampered call id", () => {
    const token = tokens.issue("call_3");
    const parts = token.split(".");
    const forged = ["victim_call", parts[1], parts[2], parts[3]].join(".");
    expect(tokens.verify(forged)).toMatchObject({ valid: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a malformed token", () => {
    expect(tokens.verify("garbage")).toMatchObject({ valid: false, reason: "MALFORMED" });
    expect(tokens.verify("")).toMatchObject({ valid: false, reason: "MALFORMED" });
  });

  it("rejects an expired token", () => {
    const token = tokens.issue("call_4");
    const [callId, nonce, , signature] = token.split(".");
    const expired = [callId, nonce, String(Date.now() - 1000), signature].join(".");
    expect(expired.split(".").length).toBe(4);
    expect(tokens.verify(expired).valid).toBe(false);
  });
});
