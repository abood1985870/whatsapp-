export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-3);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0/, "");
}

export interface StrictPhoneResult {
  normalized: string;
  valid: boolean;
  country: "SA" | "INTL" | "UNKNOWN";
}

/**
 * Canonical marketing-identity phone normalization.
 *
 * Saudi inputs all resolve to the same `9665xxxxxxxx` digits:
 * `05x…`, `+9665x…`, `9665x…`, `009665x…`, with any spaces/dashes/parens.
 * Non-Saudi numbers keep their digits (with `00` international prefix
 * stripped) and are marked INTL. Too-short garbage is marked invalid.
 *
 * The legacy `normalizePhone` above is what Contacts are keyed by; use
 * that one when looking up/creating Contact rows, and this one for lead
 * dedupe, DNC, and campaign-eligibility identity.
 */
export function normalizePhoneStrict(raw: string): StrictPhoneResult {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length < 7) {
    return { normalized: digits, valid: false, country: "UNKNOWN" };
  }

  let d = digits;
  if (d.startsWith("00")) d = d.slice(2);

  // Saudi mobile forms → 9665xxxxxxxx
  if (d.startsWith("05") && d.length === 10) {
    return { normalized: `966${d.slice(1)}`, valid: true, country: "SA" };
  }
  if (d.startsWith("5") && d.length === 9) {
    return { normalized: `966${d}`, valid: true, country: "SA" };
  }
  if (d.startsWith("9665") && d.length === 12) {
    return { normalized: d, valid: true, country: "SA" };
  }
  if (d.startsWith("96605") && d.length === 13) {
    // people sometimes write +966 05x…
    return { normalized: `9665${d.slice(5)}`, valid: true, country: "SA" };
  }

  return { normalized: d, valid: d.length >= 8 && d.length <= 15, country: "INTL" };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTruthy<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
