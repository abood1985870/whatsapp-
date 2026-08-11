import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildHandoffSummaryPrompt, buildSalesAgentSystemPrompt, MARKETING_PROMPT_VERSION, ProductPromptContext } from "./prompts";
import { structuredCall } from "./structured";
import { generateChatCompletion } from "../chat";
import { containsUntrustedUrl, mentionsDiscount, mentionsPrice } from "../output-guard";

export type SalesDecision = "REPLY" | "OFFER_DISCOUNT" | "CUSTOM_SOFTWARE" | "HANDOFF" | "NO_REPLY";

export interface SalesTurnContext {
  product: ProductPromptContext;
  businessName: string;
  businessType?: string | null;
  salesContext?: string | null;
  knowledgeContext?: string | null;
  history: Array<{ role: "customer" | "agent"; text: string }>;
  customerMessage: string;
}

export interface SalesTurnResult {
  decision: SalesDecision;
  replyMessage?: string;
  customRequest?: {
    companyActivity?: string;
    problem?: string;
    desiredSolution?: string;
    keyFeatures?: string[];
    contactDetails?: string;
  };
  handoffReason?: string;
  confidence: number;
  reason: string;
  promptVersion: string;
  tokensUsed: number;
  costUsd: number;
}

/**
 * One sales-agent turn. The model can only *request* a discount
 * (OFFER_DISCOUNT) — the caller computes the authoritative offer from the
 * backend and composes the final numbers deterministically. Model output
 * containing prices other than the injected official one is rejected.
 */
export async function processSalesTurn(context: SalesTurnContext): Promise<SalesTurnResult> {
  const systemPrompt = buildSalesAgentSystemPrompt(context);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...context.history.slice(-10).map(
      (h): ChatCompletionMessageParam => ({
        role: h.role === "customer" ? "user" : "assistant",
        content: h.role === "customer" ? `<بيانات_غير_موثوقة>${h.text.slice(0, 2000)}</بيانات_غير_موثوقة>` : h.text.slice(0, 2000),
      })
    ),
    {
      role: "user",
      content: `<بيانات_غير_موثوقة>${context.customerMessage.slice(0, 4000)}</بيانات_غير_موثوقة>`,
    },
  ];

  const result = await structuredCall<Omit<SalesTurnResult, "promptVersion" | "tokensUsed" | "costUsd">>({
    messages,
    functionName: "sales_decision",
    description: "قرار وكيل المبيعات لهذه الرسالة",
    parameters: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["REPLY", "OFFER_DISCOUNT", "CUSTOM_SOFTWARE", "HANDOFF", "NO_REPLY"] },
        replyMessage: { type: "string", description: "الرد على العميل (لقرار REPLY فقط)" },
        customRequest: {
          type: "object",
          properties: {
            companyActivity: { type: "string" },
            problem: { type: "string" },
            desiredSolution: { type: "string" },
            keyFeatures: { type: "array", items: { type: "string" } },
            contactDetails: { type: "string" },
          },
        },
        handoffReason: { type: "string" },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["decision", "confidence", "reason"],
    },
    temperature: 0.5,
    maxAttempts: 2,
    validate: (raw) => {
      const decisions: SalesDecision[] = ["REPLY", "OFFER_DISCOUNT", "CUSTOM_SOFTWARE", "HANDOFF", "NO_REPLY"];
      if (!decisions.includes(raw?.decision)) return null;
      const reply = typeof raw.replyMessage === "string" ? raw.replyMessage.trim() : undefined;
      if (raw.decision === "REPLY") {
        if (!reply || reply.length < 2 || reply.length > 2000) return null;
        if (containsUnauthorizedNumbers(reply, context.product)) return null;
        if (containsUntrustedUrl(reply, context.product.trustedUrls.map((u) => u.url))) return null;
      }
      const confidence = Number(raw.confidence);
      return {
        decision: raw.decision,
        replyMessage: reply,
        customRequest: raw.customRequest && typeof raw.customRequest === "object" ? raw.customRequest : undefined,
        handoffReason: typeof raw.handoffReason === "string" ? raw.handoffReason.slice(0, 500) : undefined,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        reason: String(raw.reason ?? "").slice(0, 500),
      };
    },
  });

  if (!result.ok || !result.data) {
    return {
      decision: "HANDOFF",
      handoffReason: "AI_STRUCTURED_OUTPUT_FAILED",
      confidence: 0,
      reason: result.error ?? "unknown",
      promptVersion: MARKETING_PROMPT_VERSION,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
    };
  }

  return {
    ...result.data,
    promptVersion: MARKETING_PROMPT_VERSION,
    tokensUsed: result.tokensUsed,
    costUsd: result.costUsd,
  };
}

/** Reject replies quoting a discount or any SAR amount other than the official price. */
function containsUnauthorizedNumbers(reply: string, product: ProductPromptContext): boolean {
  if (/خصم\s*\d|discount/i.test(reply) && !/بدون\s*خصم|لا\s*يوجد\s*خصم|ما\s*عندي\s*صلاحية/.test(reply)) return true;
  const officialDigits = product.priceFormatted.replace(/\D/g, "");
  const amounts = reply.match(/(\d[\d,،.]*)\s*(?:ريال|ر\.س|SAR)/g) ?? [];
  for (const raw of amounts) {
    const digits = raw.replace(/\D/g, "");
    if (digits && digits !== officialDigits) return true;
  }
  return false;
}



export async function generateHandoffSummary(input: {
  productName: string;
  businessName: string;
  history: Array<{ role: "customer" | "agent"; text: string }>;
}): Promise<{ summary: string; tokensUsed: number; costUsd: number }> {
  const historyText = input.history
    .slice(-20)
    .map((h) => `${h.role === "customer" ? "العميل" : "الوكيل"}: ${h.text}`)
    .join("\n");
  const prompt = buildHandoffSummaryPrompt({ productName: input.productName, businessName: input.businessName, history: historyText });
  try {
    const result = await generateChatCompletion({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.2,
    });
    const summary = typeof result.message?.content === "string" ? result.message.content.trim() : "";
    return { summary: summary || "تعذر توليد الملخص", tokensUsed: result.tokensUsed, costUsd: result.cost };
  } catch {
    return { summary: "تعذر توليد الملخص", tokensUsed: 0, costUsd: 0 };
  }
}
