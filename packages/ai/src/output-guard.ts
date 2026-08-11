/**
 * Output guards for anything the model says about money.
 *
 * The rule the product depends on is that prices and discounts come from the
 * backend, never from the model. The guard enforcing it had three holes:
 *
 *  1. `\d` does not match Arabic-Indic digits. A model writing "٢٥٠٠ ريال" or
 *     "خصم ٢٠٪" — which is what an Arabic model naturally produces — sailed
 *     straight through a check written for "2500".
 *
 *  2. The price check required a currency WORD (ريال / SAR). "السعر ٢٥٠٠"
 *     and "٢٥٠٠ ر.س" both name a price and match neither.
 *
 *  3. Only the two spellings ريال and SAR were covered — not ر.س, ريالاً,
 *     بالريال, riyal, or the ﷼ sign.
 *
 * Normalising the digits first is what makes the rest of it work.
 */

const ARABIC_INDIC = /[٠-٩]/g; // ٠-٩
const EXTENDED_ARABIC_INDIC = /[۰-۹]/g; // ۰-۹ (Persian forms)

/** Rewrites Arabic-Indic digits to ASCII so a single set of patterns covers both. */
export function normalizeDigits(input: string): string {
  if (!input) return "";
  return input
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Percent signs come in two forms; ٪ (U+066A) is the Arabic one. */
const PERCENT = "[%\\u066A]";

const DISCOUNT_WORDS = [
  "خصم", "خصماً", "خصوم", "تخفيض", "تخفيضات", "حسم", "بخصم",
  "discount", "off",
];

const CURRENCY_WORDS = [
  "ريال", "ريالاً", "ريالا", "ريالات", "بالريال", "ر\\.?\\s?س", "﷼",
  "sar", "riyal", "riyals",
];

const PRICE_WORDS = ["سعر", "السعر", "بسعر", "تكلفة", "التكلفة", "يكلف", "price", "cost", "costs"];

/** True when the text talks about a discount in any form the models actually produce. */
export function mentionsDiscount(text: string): boolean {
  const t = normalizeDigits(String(text ?? "")).toLowerCase();
  if (new RegExp(DISCOUNT_WORDS.join("|"), "i").test(t)) return true;
  // A bare percentage is a discount claim in this context.
  if (new RegExp(`\\d+\\s*${PERCENT}`).test(t)) return true;
  if (new RegExp(`${PERCENT}\\s*\\d+`).test(t)) return true;
  return false;
}

/**
 * True when the text names a price.
 *
 * Deliberately broader than "a number next to the word ريال": a price word
 * followed by a number counts, and so does a number followed by any spelling of
 * the currency. A false positive here costs one regenerated message; a false
 * negative sends a customer a number nobody authorised.
 */
export function mentionsPrice(text: string): boolean {
  const t = normalizeDigits(String(text ?? "")).toLowerCase();

  const currency = CURRENCY_WORDS.join("|");
  if (new RegExp(`\\d[\\d,.\\s]*\\s*(${currency})`, "i").test(t)) return true;
  if (new RegExp(`(${currency})\\s*\\d`, "i").test(t)) return true;

  const priceWord = PRICE_WORDS.join("|");
  // "السعر 2500", "price is 2500", "يكلف 2500".
  //
  // No \b here: JavaScript's word boundary is defined against [A-Za-z0-9_], so
  // Arabic letters are non-word characters and `سعر\b` matches only when the
  // word is followed by punctuation. That single anchor is why "السعر ٢٥٠٠"
  // passed the guard.
  if (new RegExp(`(${priceWord})[^\\d\\n]{0,20}\\d`, "i").test(t)) return true;

  return false;
}

/**
 * True when the text contains a URL that is not on the allowed list.
 *
 * Lived as a private helper inside the sales agent, so the paths that most
 * needed it did not have it: the campaign personalization validator and the
 * voice follow-up note both wrote model output straight through. A link a model
 * invented is at best broken and at worst a phishing target sent from the
 * tenant's own WhatsApp number.
 */
export function containsUntrustedUrl(text: string, trustedUrls: string[] = []): boolean {
  const urls = String(text ?? "").match(/https?:\/\/[^\s)»<>"']+/gi) ?? [];
  if (urls.length === 0) return false;
  const trusted = (trustedUrls as string[]).map((t) => String(t).replace(/\/+$/, "").toLowerCase());
  return urls.some((u) => !trusted.includes(u.replace(/\/+$/, "").toLowerCase()));
}

/**
 * Extracts every number that looks like an amount, for comparison against the
 * authoritative catalogue. Used on the voice channel, where the model speaks
 * and there is no message body to inspect before it reaches the customer.
 */
export function extractAmounts(text: string): number[] {
  const t = normalizeDigits(String(text ?? ""));
  const out: number[] = [];
  for (const match of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * Checks spoken or written output against the prices actually loaded for this
 * conversation. Returns the amounts that match nothing in the catalogue.
 *
 * Small numbers are ignored: quantities, dates and durations ("خلال ٣ أيام")
 * are not price claims, and flagging them would make the check useless.
 */
export function findUnauthorizedAmounts(
  text: string,
  authorizedAmounts: number[],
  options: { minimumAmount?: number } = {}
): number[] {
  const { minimumAmount = 100 } = options;
  if (!mentionsPrice(text)) return [];

  const allowed = new Set(authorizedAmounts);
  return extractAmounts(text).filter((n) => n >= minimumAmount && !allowed.has(n));
}
