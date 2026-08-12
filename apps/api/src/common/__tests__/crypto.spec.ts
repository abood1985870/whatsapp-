import { encryptSecret, decryptSecret, isEncrypted, secretsMatch } from "@qanoai/shared";

/**
 * Four columns held usable credentials in plaintext: TOTP seeds, OAuth tokens,
 * webhook signing secrets and WhatsApp session blobs. A database dump — a
 * backup, a restored staging copy, a read-only analytics grant — was enough to
 * mint valid 2FA codes or sign webhooks as the tenant. The config schema had
 * required CREDENTIAL_ENCRYPTION_KEY all along and nothing used it.
 */
const KEY = "a-test-key-of-at-least-32-characters!!";

describe("secret encryption", () => {
  it("round-trips a value", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    expect(decryptSecret(encryptSecret(secret, KEY), KEY)).toBe(secret);
  });

  it("does not store the plaintext anywhere in the output", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP", KEY);
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("produces a different ciphertext each time", () => {
    // A fixed IV would make identical seeds identifiable in a dump.
    const a = encryptSecret("same", KEY);
    const b = encryptSecret("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe(decryptSecret(b, KEY));
  });

  it("refuses to decrypt with the wrong key", () => {
    const encrypted = encryptSecret("secret", KEY);
    expect(() => decryptSecret(encrypted, "a-different-key-of-32-characters!!!!")).toThrow();
  });

  it("detects tampering rather than returning garbage", () => {
    const encrypted = encryptSecret("secret", KEY);
    // Flip a character in the ciphertext segment.
    const parts = encrypted.split(":");
    parts[4] = parts[4].slice(0, -2) + (parts[4].slice(-2) === "AA" ? "BB" : "AA");
    expect(() => decryptSecret(parts.join(":"), KEY)).toThrow();
  });

  it("returns legacy plaintext unchanged, so nobody is locked out mid-migration", () => {
    // Rows written before this shipped are plaintext. If decrypt threw on them,
    // every existing 2FA login would break the moment it deployed.
    expect(decryptSecret("JBSWY3DPEHPK3PXP", KEY)).toBe("JBSWY3DPEHPK3PXP");
    expect(isEncrypted("JBSWY3DPEHPK3PXP")).toBe(false);
  });

  it("never double-wraps", () => {
    const once = encryptSecret("secret", KEY);
    expect(encryptSecret(once, KEY)).toBe(once);
  });

  it("handles empty input without throwing", () => {
    expect(decryptSecret("", KEY)).toBe("");
    expect(decryptSecret(null, KEY)).toBe("");
  });

  it("rejects a malformed encrypted value", () => {
    expect(() => decryptSecret("enc:v1:not-enough-parts", KEY)).toThrow("ENCRYPTED_VALUE_MALFORMED");
  });
});

describe("secretsMatch", () => {
  it("compares equal values", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
  });

  it("rejects different values and different lengths", () => {
    expect(secretsMatch("abc123", "abc124")).toBe(false);
    expect(secretsMatch("abc", "abc123")).toBe(false);
  });
});
