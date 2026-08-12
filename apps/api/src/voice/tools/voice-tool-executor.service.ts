import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { VOICE_CAPABILITIES } from "@qanoai/permissions";
import { AuditService } from "../../audit/audit.service";
import { DiscountService, formatSarMinor } from "../../marketing/sales/discount.service";
import { LeadsService } from "../../marketing/leads/leads.service";
import { MarketingEntitlementsService } from "../../marketing/entitlements.service";
import { EvolutionProvider } from "../../whatsapp/providers/evolution.provider";
import { authorizeToolCall } from "./tool-authorization";
import { VOICE_TOOLS } from "./tool-registry";

export interface ToolExecutionContext {
  callId: string;
  organizationId: string;
  agentRole: string;
  agentAllowedTools: string[];
  contactId?: string | null;
  leadId?: string | null;
  callerPhone: string;
  toolsEnabledForOrg: boolean;
  otpAvailable: boolean;
  verifiedScopes: string[];
}

/** What the model is told. Never contains internal ids it shouldn't act on. */
export interface ToolResult {
  ok: boolean;
  /** Arabic sentence the model can say. Empty string is never returned. */
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Executes voice tool calls through the mandatory authorization pipeline:
 * schema validation → server-side tenant context → permission →
 * verification → business rules → idempotency → execute → audit.
 *
 * Every failure returns an honest result; the model is never handed a
 * fabricated success.
 */
@Injectable()
export class VoiceToolExecutorService {
  private readonly logger = new Logger(VoiceToolExecutorService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly discount: DiscountService,
    private readonly leads: LeadsService,
    private readonly entitlements: MarketingEntitlementsService,
    private readonly evolutionProvider: EvolutionProvider
  ) {}

  toolDefinitionsFor(allowedToolIds: string[]) {
    return VOICE_TOOLS.filter((t) => allowedToolIds.includes(t.id)).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async execute(context: ToolExecutionContext, toolId: string, rawArguments: unknown): Promise<ToolResult> {
    const startedAt = Date.now();
    const executionsSoFar = await prisma.callToolExecution.count({
      where: { callId: context.callId, toolId, status: { in: ["SUCCEEDED", "FAILED"] } },
    });

    const toolsEntitlementEnabled = await this.entitlements
      .isEnabled(context.organizationId, VOICE_CAPABILITIES.VOICE_TOOLS)
      .catch(() => false);

    const decision = authorizeToolCall({
      toolId,
      rawArguments,
      agentRole: context.agentRole,
      agentAllowedTools: context.agentAllowedTools,
      toolsEnabledForOrg: context.toolsEnabledForOrg,
      toolsEntitlementEnabled,
      verifiedScopes: context.verifiedScopes,
      otpAvailable: context.otpAvailable,
      executionsSoFar,
    });

    if (!decision.allowed) {
      await this.recordExecution(context.callId, toolId, "DENIED", null, null, decision.reason, Date.now() - startedAt);
      return { ok: false, message: this.denyMessage(decision.reason) };
    }

    const idempotencyKey = decision.tool.idempotent
      ? `${toolId}:${createHash("sha256").update(JSON.stringify(decision.args)).digest("hex").slice(0, 32)}`
      : null;

    if (idempotencyKey) {
      const previous = await prisma.callToolExecution.findFirst({
        where: { callId: context.callId, idempotencyKey, status: "SUCCEEDED" },
      });
      if (previous?.output) {
        return previous.output as unknown as ToolResult;
      }
    }

    try {
      const result = await this.withTimeout(
        this.runTool(context, toolId, decision.args),
        decision.tool.timeoutMs,
        toolId
      );
      await this.recordExecution(
        context.callId,
        toolId,
        result.ok ? "SUCCEEDED" : "FAILED",
        decision.args,
        result,
        result.ok ? null : "TOOL_REPORTED_FAILURE",
        Date.now() - startedAt,
        idempotencyKey
      );
      return result;
    } catch (error: any) {
      const message = String(error?.message ?? "TOOL_ERROR").slice(0, 300);
      this.logger.error(`Voice tool ${toolId} failed on call ${context.callId}: ${message}`);
      await this.recordExecution(
        context.callId,
        toolId,
        "FAILED",
        decision.args,
        null,
        message,
        Date.now() - startedAt,
        idempotencyKey
      );
      return { ok: false, message: "ما قدرت أكمل العملية الحين بسبب عطل تقني. أقدر أسجل طلبك ويتواصل معك الفريق." };
    }
  }

  private async runTool(
    context: ToolExecutionContext,
    toolId: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (toolId) {
      case "lookupProduct":
        return this.lookupProduct(context, String(args.query ?? ""));
      case "captureDetails":
        return this.captureDetails(context, args);
      case "updateLeadInterest":
        return this.updateLeadInterest(context, args);
      case "requestDiscountOffer":
        return this.requestDiscountOffer(context, args);
      case "createSupportRequest":
        return this.createSupportRequest(context, args);
      case "createCustomSoftwareRequest":
        return this.createCustomSoftwareRequest(context, args);
      case "sendWhatsAppFollowup":
        return this.sendWhatsAppFollowup(context, args);
      case "lookupCustomerRecord":
        return this.lookupCustomerRecord(context, args);
      default:
        return { ok: false, message: "هذه العملية غير متاحة." };
    }
  }

  /** The single source of product price for the voice channel. */
  private async lookupProduct(context: ToolExecutionContext, query: string): Promise<ToolResult> {
    const products = await prisma.salesProduct.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
        active: true,
        aiSalesEnabled: true,
        OR: [
          { nameArabic: { contains: query, mode: "insensitive" } },
          { nameEnglish: { contains: query, mode: "insensitive" } },
          { shortDescription: { contains: query, mode: "insensitive" } },
          { targetCustomer: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 3,
    });

    if (products.length === 0) {
      return { ok: true, message: "ما لقيت برنامجاً مطابقاً في الكتالوج. أقدر أسجل احتياجك ويتواصل معك الفريق.", data: { products: [] } };
    }

    return {
      ok: true,
      message: products.map((p) => `${p.nameArabic}: ${formatSarMinor(p.priceMinor)}`).join(" — "),
      data: {
        products: products.map((p) => ({
          productId: p.id,
          name: p.nameArabic,
          price: formatSarMinor(p.priceMinor),
          shortDescription: p.shortDescription,
          benefits: p.benefits,
          features: p.features,
        })),
      },
    };
  }

  private async captureDetails(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const name = args.contactName ? String(args.contactName) : undefined;
    const businessName = args.businessName ? String(args.businessName) : undefined;

    if (context.contactId && (name || businessName)) {
      await prisma.contact.update({
        where: { id: context.contactId },
        data: {
          ...(name ? { name } : {}),
          ...(businessName ? { company: businessName } : {}),
          ...(args.city ? { city: String(args.city) } : {}),
        },
      });
    }
    if (context.leadId) {
      await prisma.lead.update({
        where: { id: context.leadId },
        data: {
          ...(businessName ? { businessName } : {}),
          ...(args.businessType ? { businessType: String(args.businessType) } : {}),
          ...(args.city ? { city: String(args.city) } : {}),
        },
      });
    }
    await prisma.callEvent.create({
      data: { callId: context.callId, eventType: "DETAILS_CAPTURED", metadata: args as any },
    });
    return { ok: true, message: "تم تسجيل البيانات." };
  }

  private async updateLeadInterest(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    if (!context.leadId) return { ok: false, message: "ما قدرت أحدّث الاهتمام لأن العميل غير مسجل بعد." };

    const level = String(args.interestLevel ?? "LOW");
    const status =
      level === "READY_TO_BUY" ? "READY_TO_BUY" : level === "HIGH" ? "HOT" : level === "NONE" ? "NOT_INTERESTED" : "INTERESTED";

    await this.leads.transition(context.leadId, status, String(args.reason ?? "voice call"), "VOICE");
    if (args.productId) {
      await prisma.call.update({ where: { id: context.callId }, data: { productId: String(args.productId) } });
    }
    return { ok: true, message: "تم تحديث حالة العميل." };
  }

  /**
   * The model may only *request* an offer. The number comes from
   * DiscountService, which clamps to the 5% platform ceiling.
   */
  private async requestDiscountOffer(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    if (!context.leadId) return { ok: false, message: "ما أقدر أطلب عرضاً قبل تسجيل بيانات العميل." };

    const offer = await this.discount.computeOffer({
      organizationId: context.organizationId,
      leadId: context.leadId,
      productId: String(args.productId),
      reason: `voice:${String(args.reason ?? "")}`.slice(0, 400),
    });

    return {
      ok: true,
      message: `الخصم المسموح ${offer.discountPercent}%: السعر يصير ${formatSarMinor(offer.finalPriceMinor)} بدلاً من ${formatSarMinor(offer.originalPriceMinor)}.`,
      data: {
        discountPercent: offer.discountPercent,
        finalPrice: formatSarMinor(offer.finalPriceMinor),
        originalPrice: formatSarMinor(offer.originalPriceMinor),
      },
    };
  }

  private async createSupportRequest(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const call = await prisma.call.findUnique({ where: { id: context.callId } });
    await prisma.call.update({ where: { id: context.callId }, data: { supportRequired: true } });
    await prisma.callEvent.create({
      data: {
        callId: context.callId,
        eventType: "SUPPORT_REQUEST_CREATED",
        metadata: {
          reason: String(args.reason ?? ""),
          details: String(args.details ?? ""),
          urgency: String(args.urgency ?? "MEDIUM"),
        },
      },
    });

    if (context.contactId) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          organizationId: context.organizationId,
          contactId: context.contactId,
          status: { notIn: ["RESOLVED", "CLOSED", "SPAM", "BLOCKED"] },
        },
      });
      if (conversation) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            status: "WAITING_FOR_AGENT",
            handoffReason: `VOICE_CALL: ${String(args.reason ?? "").slice(0, 150)}`,
          },
        });
      }
    }

    await this.audit.log({
      organizationId: context.organizationId,
      action: "VOICE_SUPPORT_REQUEST_CREATED",
      resourceType: "Call",
      resourceId: context.callId,
      metadata: { reason: args.reason, leadId: context.leadId, urgency: args.urgency },
      correlationId: call?.correlationId ?? generateCorrelationId(),
    });

    return { ok: true, message: "تم إنشاء طلب الدعم، والفريق راح يتواصل معك." };
  }

  private async createCustomSoftwareRequest(
    context: ToolExecutionContext,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    await prisma.customSoftwareRequest.create({
      data: {
        organizationId: context.organizationId,
        leadId: context.leadId ?? null,
        companyActivity: args.companyActivity ? String(args.companyActivity) : null,
        problem: args.problem ? String(args.problem) : null,
        desiredSolution: args.desiredSolution ? String(args.desiredSolution) : null,
        keyFeatures: Array.isArray(args.keyFeatures) ? args.keyFeatures : [],
        contactDetails: args.contactDetails ? String(args.contactDetails) : context.callerPhone,
        status: "NEW",
      },
    });
    if (context.leadId) {
      await this.leads.transition(context.leadId, "CUSTOM_SOFTWARE_REQUEST", "voice call", "VOICE");
    }
    await prisma.call.update({ where: { id: context.callId }, data: { supportRequired: true } });
    return {
      ok: true,
      message: "سجلت طلب البرمجة الخاصة. الفريق راح يدرس المتطلبات ويتواصل معك — بدون أي التزام بسعر أو مدة الآن.",
    };
  }

  /**
   * Only sends URLs that exist on the product row. A failed send is
   * reported as failed — the model must not claim delivery.
   */
  private async sendWhatsAppFollowup(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const product = await prisma.salesProduct.findFirst({
      where: { id: String(args.productId), organizationId: context.organizationId, deletedAt: null },
    });
    if (!product) return { ok: false, message: "ما لقيت البرنامج المطلوب، فما أقدر أرسل الرابط." };

    const linkType = String(args.linkType);
    const url =
      linkType === "PURCHASE"
        ? product.purchaseUrl
        : linkType === "STORE"
          ? product.storeUrl
          : linkType === "DEMO"
            ? product.demoUrl
            : product.productPageUrl || product.websiteUrl;

    if (!url) return { ok: false, message: "ما عندي رابط موثوق لهذا الطلب. أقدر أسجل طلبك ويرسله لك الفريق." };

    const connection = await prisma.channelConnection.findFirst({
      where: { organizationId: context.organizationId, deletedAt: null, status: "CONNECTED" },
      orderBy: { lastConnectedAt: "desc" },
    });
    if (!connection?.providerInstanceId) {
      return { ok: false, message: "خدمة الواتساب غير متاحة الآن، فما قدرت أرسل الرابط." };
    }

    const note = args.note ? `${String(args.note).slice(0, 200)}\n\n` : "";
    try {
      await this.evolutionProvider.sendText({
        instanceId: connection.providerInstanceId,
        phoneNumber: context.callerPhone,
        text: `${note}${product.nameArabic}\n${url}`,
      });
    } catch (error: any) {
      this.logger.warn(`Voice WhatsApp followup failed: ${String(error?.message).slice(0, 150)}`);
      return { ok: false, message: "حاولت أرسل الرابط بالواتساب وما نجح الإرسال. أقدر أعيد المحاولة أو يتواصل معك الفريق." };
    }

    await prisma.callEvent.create({
      data: { callId: context.callId, eventType: "WHATSAPP_FOLLOWUP_SENT", metadata: { productId: product.id, linkType } },
    });
    return { ok: true, message: "تم إرسال الرابط على الواتساب." };
  }

  private async lookupCustomerRecord(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    // Reached only after verification succeeded (enforced in authorizeToolCall).
    if (!context.contactId) return { ok: false, message: "ما لقيت سجلاً مرتبطاً بهذا الرقم." };
    const field = String(args.field);

    if (field === "CONTACT_PROFILE") {
      const contact = await prisma.contact.findFirst({
        where: { id: context.contactId, organizationId: context.organizationId },
        select: { name: true, company: true, city: true },
      });
      return { ok: true, message: "جبت بيانات الحساب.", data: contact ?? {} };
    }
    // ORDER_STATUS / SUBSCRIPTION have no backing system in this platform yet;
    // saying otherwise would be a fabricated capability.
    return { ok: false, message: "هذه البيانات غير متوفرة في النظام حالياً. أقدر أسجل طلبك ويتواصل معك الفريق." };
  }

  private denyMessage(reason: string): string {
    switch (reason) {
      case "VERIFICATION_REQUIRED":
        return "هذي معلومات خاصة وتحتاج تحقق من هويتك أول.";
      case "VERIFICATION_UNAVAILABLE":
        return "خدمة التحقق غير متاحة حالياً، فما أقدر أطّلع على البيانات الخاصة. أقدر أسجل طلبك للفريق.";
      case "RATE_LIMIT_EXCEEDED":
        return "أعتذر، وصلت للحد المسموح لهذي العملية في المكالمة.";
      case "TOOLS_DISABLED":
      case "ENTITLEMENT_DISABLED":
      case "TOOL_NOT_ALLOWED_FOR_AGENT":
      case "ROLE_NOT_ALLOWED":
        return "هذي العملية غير متاحة لي حالياً. أقدر أسجل طلبك ويتواصل معك الفريق.";
      case "INVALID_ARGUMENTS":
        return "ناقصني بعض المعلومات لإتمام العملية. ممكن توضح لي أكثر؟";
      default:
        return "ما أقدر أنفذ هذي العملية الآن.";
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, toolId: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TOOL_TIMEOUT:${toolId}`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private async recordExecution(
    callId: string,
    toolId: string,
    status: string,
    input: unknown,
    output: unknown,
    error: string | null,
    durationMs: number,
    idempotencyKey: string | null = null
  ) {
    await prisma.callToolExecution
      .create({
        data: {
          callId,
          toolId,
          status,
          denyReason: status === "DENIED" ? error : null,
          errorMessage: status === "FAILED" ? error : null,
          input: (input ?? undefined) as any,
          output: (output ?? undefined) as any,
          idempotencyKey,
          durationMs,
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }
}
