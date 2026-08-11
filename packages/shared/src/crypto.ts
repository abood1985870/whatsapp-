import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "crypto";

/**
 * Envelope encryption for secrets held in the database.
 *
 * Four columns held usable credentials in plaintext: TOTP seeds, OAuth access
 * and refresh tokens, outbound webhook signing secrets, and WhatsApp session
 * blobs. Anyone with a database dump — a backup, a restored staging copy, a
 * read-only analytics grant — could mint valid 2FA codes, sign webhooks as the
 * tenant, or resume their WhatsApp session. The config schema had
 * CREDENTIAL_ENCRYPTION_KEY defined and required, and nothing used it.
 *
 * AES-256-GCM so tampering is detected rather than silently decrypted into
 * garbage. Each value gets its own random IV.
 *
 * Format: `enc:v1:<iv-base64>:<tag-base64>:<ciphertext-base64>`
 *
 * MIGRATION: `decryptSecret` returns any value that does not carry the prefix
 * unchanged. That is deliberate — existing plaintext rows keep working while
 * they are re-encrypted on next write, rather than every 2FA login breaking the
 * moment this ships. `isEncrypted` exists so a migration script can tell what
 * is left.
 */
const PREFIX = "enc:v1:";

function keyFrom(secret: string): Buffer {
  // The configured key is a passphrase of at least 32 characters, not
  // necessarily 32 BYTES of key material. Hashing normalises it to exactly the
  // 32 bytes AES-256 requires.
  return createHash("sha256").update(secret).digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string, keySource: string): string {
  if (!keySource) throw new Error("ENCRYPTION_KEY_MISSING");
  if (plaintext === null || plaintext === undefined) throw new Error("NOTHING_TO_ENCRYPT");
  if (isEncrypted(plaintext)) return plaintext; // never double-wrap

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keySource), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined, keySource: string): string {
  if (value === null || value === undefined || value === "") return "";
  // Legacy plaintext. Returned as-is so nothing breaks mid-migration.
  if (!isEncrypted(value)) return value;
  if (!keySource) throw new Error("ENCRYPTION_KEY_MISSING");

  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("ENCRYPTED_VALUE_MALFORMED");

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keySource), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  // Throws on a bad tag, which is the point: a tampered value fails loudly
  // rather than decrypting to nonsense that some caller then trusts.
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Constant-time comparison for secrets that are checked rather than decrypted. */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
