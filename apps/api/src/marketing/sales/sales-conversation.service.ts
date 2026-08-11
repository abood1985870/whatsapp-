import { Injectable, Logger } from "@nestjs/common";
import { config } from "@qanoai/config";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import {
  classifyIntent,
  detectDeterministicIntent,
  generateHandoffSummary,
  processSalesTurn,
  SalesTurnContext,
} from "@qanoai/ai";
import { EvolutionProvider } from "../../whatsapp/providers/evolution.provider";
import { DncService } from "../dnc/dnc.service";
import { DiscountService, formatSarMinor } from "./discount.service";
import { HotLeadService } from "./hot-lead.service";
import { LeadsService } from "../leads/leads.service";

interface SalesContext {
  campaignId?: string;
  leadId?: string;
  productId?: string;
  recipientId?: string;
}

/**
 * Handles one inbound customer message on a MARKETING_SALES conversation.
 * Invoked by the webhook integration ONLY when the conversation carries a
 * salesContext. Support conversations never reach here.
 */
@Injectable()
export class SalesConversationService {
  private readonly logger = new Logger(SalesConversationService.name);

  constructor(
    private readonly evolutionProvider: EvolutionProvider,
    private readonly dnc: DncService,
    private readonly discount: DiscountService,
    private readonly hotLead: HotLeadService,
    private readonly leads: LeadsService
  ) {}

  /**
   * Returns true if it handled the message (so the caller must NOT run the
   * normal support AI chain). Fails open: on any error returns false so
   * existing behavior is preserved.
   */
  async handleInbound(input: {
    organizationId: string;
    conversation: any;
    contact: any;
    connection: any;
    messageText: string;
    inboundMessageId: string;
  }): Promise<boolean> {
    try {
      const salesContext: SalesContext = (input.conversation.metadata as any)?.salesContext ?? {};
      if (!salesContext.leadId || !salesContext.productId) return false;

      // 1. Atomically mark the recipient REPLIED and stop future marketing —
      //    this must happen before any send decision (reply-during-send race).
      if (salesContext.recipientId) {
        await prisma.campaignRecipient.updateMany({
          where: { id: salesContext.recipientId, status: { in: ["PENDING", "READY", "QUEUED", "SENDING", "SENT"] } },
          data: { status: "REPLIED", repliedAt: new Date() },
        });
        await prisma.campaign
          .update({ where: { id: salesContext.campaignId }, data: { repliedCount: { increment: 1 } } })
          .catch(() => undefined);
      }

      // 2. Deterministic opt-out wins over everything.
      const isOptOut = this.dnc.detectOptOutIntent(input.messageText);
      if (isOptOut) {
        await this.dnc.addNormalized(input.organizationId, input.contact.primaryPhone, "customer opt-out", null, "OPT_OUT");
        await prisma.contact.update({
          where: { id: input.contact.id },
          data: { consentStatus: "OPTED_OUT", marketingOptOutAt: new Date() },
        });
        await this.leads.transition(salesContext.leadId, "DO_NOT_CONTACT", "customer opt-out", "OPT_OUT");
        return true; // handled: no sales reply
      }

      const product = await prisma.salesProduct.findFirst({
        where: { id: salesContext.productId, organizationId: input.organizationId },
      });
      const lead = await prisma.lead.findFirst({ where: { id: salesContext.leadId, organizationId: input.organizationId } });
      if (!product || !lead) return false;

      // 3. Intent (deterministic first, AI refine).
      const deterministic = detectDeterministicIntent(input.messageText, false);
      const aiIntent = await classifyIntent(input.messageText);
      const intent = deterministic ?? aiIntent.data?.intent ?? "OTHER";
      const interestLevel = aiIntent.data?.interestLevel ?? "LOW";

      await this.leads.transition(salesContext.leadId, this.leadStatusForIntent(intent, interestLevel, lead.status), `intent:${intent}`, "SALES_AI");

      // 4. History for the sales turn.
      const history = await this.loadHistory(input.conversation.id);
      const context: SalesTurnContext = {
        product: this.productContext(product),
        businessName: lead.businessName,
        businessType: lead.businessType,
        salesContext: (await this.campaignSalesContext(salesContext.campaignId)) ?? undefined,
        knowledgeContext: null,
        history,
        customerMessage: input.messageText,
      };

      const turn = await processSalesTurn(context);
      await this.recordAiRun(input, salesContext, turn);

      // 5. Hot lead / handoff signalling.
      const hot = intent === "PURCHASE_INTENT" || interestLevel === "READY_TO_BUY" || turn.decision === "OFFER_DISCOUNT";
      if (hot) {
        await this.leads.transition(salesContext.leadId, "HOT", "hot lead", "SALES_AI");
        await this.hotLead.notifyIfNeeded({
          organizationId: input.organizationId,
          leadId: lead.id,
          campaignId: salesContext.campaignId,
          conversationId: input.conversation.id,
          productName: product.nameArabic,
          priceMinor: product.priceMinor,
          businessName: lead.businessName,
          businessType: lead.businessType,
          lastMessage: input.messageText,
          appBaseUrl: config.APP_URL,
        });
      }

      switch (turn.decision) {
        case "REPLY":
          if (turn.replyMessage) await this.sendSalesMessage(input, turn.replyMessage);
          return true;
        case "OFFER_DISCOUNT": {
          const offer = await this.discount.computeOffer({
            organizationId: input.organizationId,
            leadId: lead.id,
            productId: product.id,
            conversationId: input.conversation.id,
            reason: turn.reason,
          });
          const text = `بناءً على اهتمامك، أقدر أقدم لك خصم ${offer.discountPercent}% — يصير السعر ${formatSarMinor(offer.finalPriceMinor)} بدل ${formatSarMinor(offer.originalPriceMinor)}. تحب نكمل؟`;
          await this.sendSalesMessage(input, text);
          return true;
        }
        case "CUSTOM_SOFTWARE":
          await this.createCustomRequest(input, salesContext, turn);
          await this.handoff(input, product.nameArabic, lead.businessName, "custom software request");
          await this.leads.transition(salesContext.leadId, "CUSTOM_SOFTWARE_REQUEST", "custom software", "SALES_AI");
          return true;
        case "HANDOFF":
          await this.handoff(input, product.nameArabic, lead.businessName, turn.handoffReason ?? "AI handoff");
          await this.leads.transition(salesContext.leadId, "HANDED_TO_SUPPORT", turn.handoffReason ?? "handoff", "SALES_AI");
          return true;
        case "NO_REPLY":
        default:
          return true;
      }
    } catch (error: any) {
      this.logger.error(`Sales conversation handling failed: ${error?.message}`);
      return false; // fail open to existing behavior
    }
  }

  private productContext(product: any) {
    const trustedUrls: { label: string; url: string }[] = [];
    if (product.purchaseUrl) trustedUrls.push({ label: "رابط الشراء", url: product.purchaseUrl });
    if (product.storeUrl) trustedUrls.push({ label: "المتجر", url: product.storeUrl });
    if (product.demoUrl) trustedUrls.push({ label: "عرض تجريبي", url: product.demoUrl });
    if (product.productPageUrl) trustedUrls.push({ label: "صفحة البرنامج", url: product.productPageUrl });
    return {
      nameArabic: product.nameArabic,
      shortDescription: product.shortDescription,
      priceFormatted: formatSarMinor(product.priceMinor),
      targetCustomer: product.targetCustomer,
      features: this.arr(product.features),
      benefits: this.arr(product.benefits),
      painPoints: this.arr(product.painPoints),
      salesTalkingPoints: this.arr(product.salesTalkingPoints),
      faqs: Array.isArray(product.faqs) ? product.faqs : [],
      objectionGuidance: Array.isArray(product.objectionGuidance) ? product.objectionGuidance : [],
      maxDiscountPercent: Math.min(product.maxDiscountPercent ?? 5, 5),
      trustedUrls,
    };
  }

  private async campaignSalesContext(campaignId?: string): Promise<string | null> {
    if (!campaignId) return null;
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { salesContext: true } });
    return campaign?.salesContext ?? null;
  }

  private async loadHistory(conversationId: string): Promise<Array<{ role: "customer" | "agent"; text: string }>> {
    const messages = await prisma.message.findMany({
      where: { conversationId, text: { not: null } },
      orderBy: { createdAt: "asc" },
      take: 40,
      select: { direction: true, text: true },
    });
    return messages.map((m) => ({ role: m.direction === "INBOUND" ? "customer" : "agent", text: m.text ?? "" }));
  }

  private async sendSalesMessage(input: any, text: string) {
    const message = await prisma.message.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversation.id,
        channelConnectionId: input.connection.id,
        contactId: input.contact.id,
        direction: "OUTBOUND",
        senderType: "AI_AGENT",
        messageType: "TEXT",
        text,
        providerStatus: "PENDING",
        isAiGenerated: true,
        metadata: { kind: "SALES_REPLY" },
      },
    });
    try {
      const result = await this.evolutionProvider.sendText({
        instanceId: input.connection.providerInstanceId,
        phoneNumber: input.contact.normalizedPhone,
        text,
      });
      await prisma.message.update({
        where: { id: message.id },
        data: { providerStatus: "SENT", providerMessageId: result.messageId, sentAt: new Date() },
      });
    } catch (error: any) {
      await prisma.message.update({
        where: { id: message.id },
        data: { providerStatus: "FAILED", providerErrorMessage: String(error?.message ?? "").slice(0, 500), failedAt: new Date() },
      });
    }
  }

  private async handoff(input: any, productName: string, businessName: string, reason: string) {
    const history = await this.loadHistory(input.conversation.id);
    const summary = await generateHandoffSummary({ productName, businessName, history });
    await prisma.conversation.update({
      where: { id: input.conversation.id },
      data: { status: "WAITING_FOR_AGENT", handoffReason: reason.slice(0, 200), summary: summary.summary.slice(0, 4000) },
    });
    await prisma.conversationEvent.create({
      data: { conversationId: input.conversation.id, eventType: "SALES_HANDOFF", metadata: { reason, summary: summary.summary } },
    });
  }

  private async createCustomRequest(input: any, salesContext: SalesContext, turn: any) {
    await prisma.customSoftwareRequest.create({
      data: {
        organizationId: input.organizationId,
        leadId: salesContext.leadId ?? null,
        conversationId: input.conversation.id,
        companyActivity: turn.customRequest?.companyActivity ?? null,
        problem: turn.customRequest?.problem ?? null,
        desiredSolution: turn.customRequest?.desiredSolution ?? null,
        keyFeatures: Array.isArray(turn.customRequest?.keyFeatures) ? turn.customRequest.keyFeatures : [],
        contactDetails: turn.customRequest?.contactDetails ?? input.contact.primaryPhone,
        status: "NEW",
      },
    });
  }

  private async recordAiRun(input: any, salesContext: SalesContext, turn: any) {
    const agent = await prisma.aiAgent.findFirst({ where: { organizationId: input.organizationId, status: "ACTIVE" } });
    if (!agent) return;
    await prisma.aiRun
      .create({
        data: {
          organizationId: input.organizationId,
          agentId: agent.id,
          conversationId: input.conversation.id,
          status: "COMPLETED",
          decision: { decision: turn.decision, kind: "SALES" },
          confidence: turn.confidence,
          input: input.messageText,
          output: turn.replyMessage ?? null,
          tokenUsage: { total: turn.tokensUsed },
          costUsd: turn.costUsd,
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  private leadStatusForIntent(intent: string, interestLevel: string, current: string): string {
    if (intent === "PURCHASE_INTENT" || interestLevel === "READY_TO_BUY") return "READY_TO_BUY";
    if (intent === "NOT_INTERESTED") return "NOT_INTERESTED";
    if (intent === "INTERESTED" || ["MEDIUM", "HIGH"].includes(interestLevel)) return "INTERESTED";
    if (["DISCOVERED", "ELIGIBLE", "CONTACTED"].includes(current)) return "REPLIED";
    return current;
  }

  private arr(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  }
}
