import { buildPersonalizationPrompt, buildWebsiteSummaryPrompt, MARKETING_PROMPT_VERSION, ProductPromptContext } from "./prompts";
import { structuredCall } from "./structured";
import { containsUntrustedUrl, mentionsDiscount, mentionsPrice } from "../output-guard";

export interface WebsiteSummaryResult {
  businessSummary: string;
  services: string[];
  relevantContext: string;
  possiblePainPoints: string[];
  productFit: string;
}

export interface PersonalizationResult {
  message: string;
  personalizationReason: string;
  usedWebsiteContext: boolean;
  confidence: number;
  warnings: string[];
  promptVersion: string;
  tokensUsed: number;
  costUsd: number;
}

export async function summarizeWebsite(input: {
  businessName: string;
  businessType?: string | null;
  productName: string;
  pagesText: string;
}): Promise<{ ok: boolean; data?: WebsiteSummaryResult; tokensUsed: number; costUsd: number; error?: string }> {
  const prompt = buildWebsiteSummaryPrompt(input);
  return structuredCall<WebsiteSummaryResult>({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    functionName: "website_summary",
    description: "ملخص منظم لموقع منشأة تجارية",
    parameters: {
      type: "object",
      properties: {
        businessSummary: { type: "string", description: "ملخص النشاط في جملتين" },
        services: { type: "array", items: { type: "string" }, description: "أهم الخدمات" },
        relevantContext: { type: "string", description: "سياق مفيد للتخصيص" },
        possiblePainPoints: { type: "array", items: { type: "string" } },
        productFit: { type: "string", description: "مدى ملاءمة البرنامج للنشاط" },
      },
      required: ["businessSummary", "services", "relevantContext", "possiblePainPoints", "productFit"],
    },
    validate: (raw) => {
      if (typeof raw?.businessSummary !== "string" || raw.businessSummary.length < 5) return null;
      return {
        businessSummary: String(raw.businessSummary).slice(0, 2000),
        services: Array.isArray(raw.services) ? raw.services.slice(0, 15).map(String) : [],
        relevantContext: String(raw.relevantContext ?? "").slice(0, 2000),
        possiblePainPoints: Array.isArray(raw.possiblePainPoints) ? raw.possiblePainPoints.slice(0, 10).map(String) : [],
        productFit: String(raw.productFit ?? "").slice(0, 1000),
      };
    },
  });
}

export async function generatePersonalizedMessage(input: {
  product: ProductPromptContext;
  businessName: string;
  businessType?: string | null;
  city?: string | null;
  websiteSummary?: string | null;
  websitePainPoints?: string[] | null;
  salesContext?: string | null;
  tone: string;
  maxAttempts: number;
}): Promise<{ ok: boolean; data?: PersonalizationResult; error?: string; tokensUsed: number; costUsd: number }> {
  const prompt = buildPersonalizationPrompt(input);
  const result = await structuredCall<Omit<PersonalizationResult, "promptVersion" | "tokensUsed" | "costUsd">>({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    functionName: "personalized_message",
    description: "رسالة واتساب تعريفية مخصصة",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "نص الرسالة النهائي" },
        personalizationReason: { type: "string", description: "لماذا هذه الرسالة مناسبة لهذه المنشأة" },
        usedWebsiteContext: { type: "boolean" },
        confidence: { type: "number", description: "0..1" },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["message", "personalizationReason", "usedWebsiteContext", "confidence", "warnings"],
    },
    maxAttempts: Math.max(1, Math.min(input.maxAttempts, 3)),
    temperature: 0.6,
    validate: (raw) => {
      const message = typeof raw?.message === "string" ? raw.message.trim() : "";
      if (message.length < 30 || message.length > 1200) return null;
      // Hard content guards: no prices or discount talk in a first-touch
      // message. These were previously written against ASCII digits and needed
      // a currency word, so "خصم ٢٠٪" and "السعر ٢٥٠٠" both passed — which is
      // exactly what an Arabic model writes.
      if (mentionsDiscount(message)) return null;
      if (mentionsPrice(message)) return null;
      // A URL the model produced is never trustworthy; only backend-injected
      // links may reach a customer.
      if (containsUntrustedUrl(message)) return null;
      const confidence = Number(raw.confidence);
      return {
        message,
        personalizationReason: String(raw.personalizationReason ?? "").slice(0, 1000),
        usedWebsiteContext: raw.usedWebsiteContext === true,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        warnings: Array.isArray(raw.warnings) ? raw.warnings.slice(0, 5).map(String) : [],
      };
    },
  });

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error, tokensUsed: result.tokensUsed, costUsd: result.costUsd };
  }
  return {
    ok: true,
    data: { ...result.data, promptVersion: MARKETING_PROMPT_VERSION, tokensUsed: result.tokensUsed, costUsd: result.costUsd },
    tokensUsed: result.tokensUsed,
    costUsd: result.costUsd,
  };
}
