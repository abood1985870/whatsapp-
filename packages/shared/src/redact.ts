/**
 * Redaction for anything that gets written down.
 *
 * Three different places in this system persist or print text that came from a
 * customer: call transcripts, application logs, and stored webhook payloads.
 * All three kept the raw text. A support conversation routinely contains a
 * phone number, an ID number, an IBAN, an email; a call transcript contains
 * whatever the caller said out loud. None of it needed to be stored in the
 * clear to make the product work.
 *
 * This is deliberately separate from `maskPII` in @qanoai/ai. That one exists
 * to keep PII out of a MODEL PROMPT and runs on a 4000-character clamp for
 * latency. This one exists to keep PII out of STORAGE and logs, covers the
 * Saudi-specific formats that matter here, and is not in a request hot path.
 */

/** Keeps the first three and last two digits — enough to recognise, not enough to dial. */
export function maskPhoneNumber(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

const PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Saudi national / iqama id: 10 digits starting 1 or 2.
  { pattern: /\b[12]\d{9}\b/g, replacement: "[ID]" },
  // IBAN, Saudi and general.
  { pattern: /\bSA\d{2}[\s-]?(?:\d[\s-]?){20}\b/gi, replacement: "[IBAN]" },
  { pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, replacement: "[IBAN]" },
  // Card numbers — bounded so the separator run cannot grow (see maskPII).
  { pattern: /\b\d(?:[ -]?\d){12,15}\b/g, replacement: "[CARD]" },
  // Email.
  { pattern: /[^\s@]{1,64}@[^\s@.]{1,255}\.[A-Za-z]{2,24}/g, replacement: "[EMAIL]" },
  // Phone numbers in the forms people actually write them.
  { pattern: /\+966[\s-]?\d(?:[\s-]?\d){8}/g, replacement: "[PHONE]" },
  { pattern: /\b05\d(?:[\s-]?\d){7}\b/g, replacement: "[PHONE]" },
  { pattern: /\b\+\d{10,15}\b/g, replacement: "[PHONE]" },
];

const MAX_REDACT_CHARS = 20000;

/**
 * Replaces identifiers in free text. Order matters: ids and IBANs are matched
 * before the generic card pattern, which would otherwise swallow them.
 */
export function redactPII(input: string | null | undefined): string {
  if (!input) return "";
  let text = String(input);
  if (text.length > MAX_REDACT_CHARS) text = text.slice(0, MAX_REDACT_CHARS);
  for (const { pattern, replacement } of PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

/** Keys whose VALUES are never safe to write down, whatever they contain. */
const SECRET_KEYS = [
  "password", "passwordhash", "token", "accesstoken", "refreshtoken", "apikey",
  "api_key", "secret", "authorization", "cookie", "sessionid", "jti", "otp",
  "code", "twofactor", "seed", "privatekey", "credentials",
];

/** Keys that hold personal data and should be masked rather than dropped. */
const PII_KEYS = ["phone", "phonenumber", "primaryphone", "normalizedphone", "msisdn", "from", "to", "email"];

/**
 * Deep-redacts an object for logging.
 *
 * Secrets are replaced entirely; personal data is masked so a log line stays
 * useful for correlating without becoming a copy of the customer database.
 */
export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactPII(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    // Arrays are truncated: a log line is not a data export.
    return value.slice(0, 20).map((v) => redactObject(v, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (SECRET_KEYS.some((k) => lower.includes(k))) {
        out[key] = "[REDACTED]";
      } else if (PII_KEYS.some((k) => lower === k || lower.endsWith(k))) {
        out[key] = typeof raw === "string" ? maskPhoneNumber(raw) : "[REDACTED]";
      } else {
        out[key] = redactObject(raw, depth + 1);
      }
    }
    return out;
  }

  return "[unserialisable]";
}
