import { createHmac } from "crypto";

const SECRET = "test-evolution-webhook-secret-value";

// @qanoai/config parses process.env at import time, so the mock must be
// declared before the provider is required.
jest.mock("@qanoai/config", () => ({
  config: {
    EVOLUTION_API_URL: "https://evolution.example.test",
    EVOLUTION_API_KEY: "test-key",
    EVOLUTION_WEBHOOK_SECRET: undefined as string | undefined,
    EVOLUTION_WEBHOOK_BASE_URL: "https://api.example.test",
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { config } = require("@qanoai/config");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EvolutionProvider } = require("../../providers/evolution.provider");

const payload = {
  event: "messages.upsert",
  instance: "some-connection-id",
  data: {
    key: { id: "MSG1", remoteJid: "966500000000@s.whatsapp.net" },
    message: { conversation: "مرحبا" },
  },
};

function makeProvider() {
  // The provider only needs an HttpService for outbound calls, which these
  // tests never exercise.
  return new EvolutionProvider({ axiosRef: {} } as any);
}

function sign(body: unknown, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
}

describe("Evolution webhook signature", () => {
  afterEach(() => {
    config.EVOLUTION_WEBHOOK_SECRET = undefined;
  });

  it("REJECTS every request when the secret is not configured (fails closed)", () => {
    config.EVOLUTION_WEBHOOK_SECRET = undefined;
    const provider = makeProvider();

    // This is the regression under test: an unset secret used to make the
    // endpoint accept anything, leaving the public webhook URL wide open.
    expect(provider.hasValidSignature(payload, {}, {})).toBe(false);
    expect(provider.hasValidSignature(payload, { "x-evolution-secret": "guess" }, {})).toBe(false);
    expect(provider.hasValidSignature(payload, {}, { secret: "guess" })).toBe(false);
  });

  it("rejects an unsigned request when the secret IS configured", () => {
    config.EVOLUTION_WEBHOOK_SECRET = SECRET;
    const provider = makeProvider();

    expect(provider.hasValidSignature(payload, {}, {})).toBe(false);
  });

  it("rejects a wrong shared secret in both the header and the query", () => {
    config.EVOLUTION_WEBHOOK_SECRET = SECRET;
    const provider = makeProvider();

    expect(provider.hasValidSignature(payload, { "x-evolution-secret": SECRET + "x" }, {})).toBe(false);
    expect(provider.hasValidSignature(payload, {}, { secret: SECRET.slice(0, -1) })).toBe(false);
    expect(provider.hasValidSignature(payload, {}, { token: "" })).toBe(false);
  });

  it("rejects a signature computed with a different secret", () => {
    config.EVOLUTION_WEBHOOK_SECRET = SECRET;
    const provider = makeProvider();

    expect(
      provider.hasValidSignature(payload, { "x-evolution-signature": sign(payload, "wrong-secret") }, {})
    ).toBe(false);
  });

  it("rejects a valid signature replayed onto a tampered body", () => {
    config.EVOLUTION_WEBHOOK_SECRET = SECRET;
    const provider = makeProvider();
    const signature = sign(payload, SECRET);

    const tampered = {
      ...payload,
      data: { ...payload.data, key: { ...payload.data.key, remoteJid: "966511111111@s.whatsapp.net" } },
    };

    expect(provider.hasValidSignature(tampered, { "x-evolution-signature": signature }, {})).toBe(false);
  });

  it("accepts the correct shared secret and the correct signature", () => {
    config.EVOLUTION_WEBHOOK_SECRET = SECRET;
    const provider = makeProvider();

    expect(provider.hasValidSignature(payload, { "x-evolution-secret": SECRET }, {})).toBe(true);
    expect(provider.hasValidSignature(payload, {}, { secret: SECRET })).toBe(true);
    expect(provider.hasValidSignature(payload, {}, { token: SECRET })).toBe(true);
    expect(
      provider.hasValidSignature(payload, { "x-evolution-signature": sign(payload, SECRET) }, {})
    ).toBe(true);
    expect(
      provider.hasValidSignature(payload, { "x-hub-signature-256": "sha256=" + sign(payload, SECRET) }, {})
    ).toBe(true);
  });
});
