import { buildIntentClassificationPrompt } from "./prompts";
import { structuredCall } from "./structured";

export type SalesIntent =
  | "PURCHASE_INTENT"
  | "INTERESTED"
  | "QUESTION"
  | "OBJECTION"
  | "NOT_INTERESTED"
  | "OPT_OUT"
  | "HUMAN_REQUEST"
  | "CUSTOM_SOFTWARE"
  | "OTHER";

export interface IntentClassification {
  intent: SalesIntent;
  interestLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "READY_TO_BUY";
  requiresHuman: boolean;
  confidence: number;
  reason: string;
}

// Deterministic Arabic/English purchase-intent markers.
const PURCHASE_PATTERNS: RegExp[] = [
  /أبي\s*(أشترك|اشترك|أشتري|اشتري|أكمل|اكمل)/,
  /ابي\s*(اشترك|اشتري|اكمل)/,
  /كيف\s*(أدفع|ادفع|أشتري|اشتري|أطلب|اطلب|أشترك|اشترك)/,
  /وين\s*أطلب|وين\s*اطلب/,
  /أرسل\s*(الرابط|رابط)|ارسل\s*(الرابط|رابط)/,
  /مناسب\s*(لي|لنا)?\s*(أبي|ابي|نبي)?/,
  /نبي\s*(نشترك|نشتري)/,
];

const HUMAN_PATTERNS: RegExp[] = [
  /أبي\s*(أكلم|اكلم)\s*(موظف|أحد|احد|إنسان|بشر)/,
  /كلموني|اتصلوا\s*بي|تواصلوا\s*معي/,
  /موظف\s*(حقيقي|بشري)/,
  /\bhuman\b|\bagent\b/i,
];

/** Fast, deterministic pre-check; the AI classifier refines but can never weaken OPT_OUT. */
export function detectDeterministicIntent(text: string, isOptOut: boolean): SalesIntent | null {
  if (isOptOut) return "OPT_OUT";
  const t = (text || "").trim();
  if (!t) return null;
  if (PURCHASE_PATTERNS.some((p) => p.test(t))) return "PURCHASE_INTENT";
  if (HUMAN_PATTERNS.some((p) => p.test(t))) return "HUMAN_REQUEST";
  return null;
}

export async function classifyIntent(
  message: string
): Promise<{ ok: boolean; data?: IntentClassification; tokensUsed: number; costUsd: number }> {
  const prompt = buildIntentClassificationPrompt(message);
  const result = await structuredCall<IntentClassification>({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    functionName: "classify_intent",
    description: "تصنيف نية رسالة عميل في محادثة مبيعات",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "PURCHASE_INTENT",
            "INTERESTED",
            "QUESTION",
            "OBJECTION",
            "NOT_INTERESTED",
            "OPT_OUT",
            "HUMAN_REQUEST",
            "CUSTOM_SOFTWARE",
            "OTHER",
          ],
        },
        interestLevel: { type: "string", enum: ["NONE", "LOW", "MEDIUM", "HIGH", "READY_TO_BUY"] },
        requiresHuman: { type: "boolean" },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["intent", "interestLevel", "requiresHuman", "confidence", "reason"],
    },
    temperature: 0,
    validate: (raw) => {
      const intents = [
        "PURCHASE_INTENT",
        "INTERESTED",
        "QUESTION",
        "OBJECTION",
        "NOT_INTERESTED",
        "OPT_OUT",
        "HUMAN_REQUEST",
        "CUSTOM_SOFTWARE",
        "OTHER",
      ];
      const levels = ["NONE", "LOW", "MEDIUM", "HIGH", "READY_TO_BUY"];
      if (!intents.includes(raw?.intent) || !levels.includes(raw?.interestLevel)) return null;
      const confidence = Number(raw.confidence);
      return {
        intent: raw.intent,
        interestLevel: raw.interestLevel,
        requiresHuman: raw.requiresHuman === true,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        reason: String(raw.reason ?? "").slice(0, 500),
      };
    },
  });
  return { ok: result.ok, data: result.data, tokensUsed: result.tokensUsed, costUsd: result.costUsd };
}
