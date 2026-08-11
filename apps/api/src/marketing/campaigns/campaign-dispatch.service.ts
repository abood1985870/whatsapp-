import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { sleep } from "@qanoai/shared";
import { generatePersonalizedMessage, ProductPromptContext } from "@qanoai/ai";
import { MarketingSettingsService } from "../settings/marketing-settings.service";
import { WebsiteIntelligenceService } from "../website/website-intelligence.service";
import { MarketingSendService } from "./marketing-send.service";
import { formatSarMinor } from "../sales/discount.service";

/**
 * Drives campaign preparation (personalization) and dispatch (sending).
 * Designed to be called both by the worker processor and by an inline
 * fallback when Redis queues are disabled. Bounded batches, per-recipient
 * isolation (one failure never aborts the run), and a spend circuit
 * breaker via the AI budget in MarketingSettings.
 */
@Injectable()
export class CampaignDispatchService {
  private readonly logger = new Logger(CampaignDispatchService.name);

  constructor(
    private readonly settings: MarketingSettingsService,
    private readonly website: WebsiteIntelligenceService,
    private readonly sender: MarketingSendService
  ) {}

  buildProductContext(product: any): ProductPromptContext {
    const trustedUrls: { label: string; url: string }[] = [];
    if (product.purchaseUrl) trustedUrls.push({ label: "رابط الشراء", url: product.purchaseUrl });
    if (product.storeUrl) trustedUrls.push({ label: "المتجر", url: product.storeUrl });
    if (product.demoUrl) trustedUrls.push({ label: "عرض تجريبي", url: product.demoUrl });
    if (product.productPageUrl) trustedUrls.push({ label: "صفحة البرنامج", url: product.productPageUrl });
    if (product.websiteUrl) trustedUrls.push({ label: "الموقع", url: product.websiteUrl });
    return {
      nameArabic: product.nameArabic,
      shortDescription: product.shortDescription,
      priceFormatted: formatSarMinor(product.priceMinor),
      targetCustomer: product.targetCustomer,
      features: this.asStringArray(product.features),
      benefits: this.asStringArray(product.benefits),
      painPoints: this.asStringArray(product.painPoints),
      salesTalkingPoints: this.asStringArray(product.salesTalkingPoints),
      faqs: Array.isArray(product.faqs) ? product.faqs : [],
      objectionGuidance: Array.isArray(product.objectionGuidance) ? product.objectionGuidance : [],
      maxDiscountPercent: Math.min(product.maxDiscountPercent ?? 5, 5),
      trustedUrls,
    };
  }

  /**
   * Personalize up to `batchSize` PENDING recipients of a PREPARING campaign.
   * When all recipients are resolved (READY or FAILED), flips PREPARING → READY.
   */
  async prepareBatch(campaignId: string, batchSize = 10): Promise<{ processed: number; done: boolean }> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { product: true },
    });
    if (!campaign || !["PREPARING", "READY", "RUNNING"].includes(campaign.status)) {
      return { processed: 0, done: true };
    }

    const settings = await this.settings.getOrCreate(campaign.organizationId);
    if (await this.isOverBudget(campaign.organizationId, settings)) {
      this.logger.warn(`Campaign ${campaignId} preparation paused: AI budget exceeded`);
      await prisma.campaign.updateMany({ where: { id: campaignId, status: "RUNNING" }, data: { status: "PAUSED", pausedAt: new Date() } });
      return { processed: 0, done: true };
    }

    const pending = await prisma.campaignRecipient.findMany({
      where: { campaignId, isTest: false, personalizationStatus: "PENDING", status: { in: ["PENDING", "READY", "QUEUED"] } },
      include: { lead: true },
      take: batchSize,
    });

    const productContext = this.buildProductContext(campaign.product);
    let processed = 0;

    for (const recipient of pending) {
      try {
        let websiteSummary: string | null = null;
        let websitePainPoints: string[] | null = null;
        if (recipient.lead.website) {
          const profileId = await this.website.analyzeForLead(campaign.organizationId, recipient.leadId, campaign.product.nameArabic);
          if (profileId) {
            const profile = await prisma.websiteProfile.findUnique({ where: { id: profileId } });
            if (profile?.fetchStatus === "OK") {
              websiteSummary = profile.businessSummary;
              websitePainPoints = this.asStringArray(profile.possiblePainPoints);
            }
          }
        }

        const result = await generatePersonalizedMessage({
          product: productContext,
          businessName: recipient.lead.businessName,
          businessType: recipient.lead.businessType,
          city: recipient.lead.city,
          websiteSummary,
          websitePainPoints,
          salesContext: campaign.salesContext,
          tone: settings.defaultTone,
          maxAttempts: settings.maxPersonalizationAttempts,
        });

        if (result.ok && result.data) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              personalizationStatus: "READY",
              personalizedMessage: result.data.message,
              personalizationMeta: {
                reason: result.data.personalizationReason,
                usedWebsiteContext: result.data.usedWebsiteContext,
                confidence: result.data.confidence,
                warnings: result.data.warnings,
                promptVersion: result.data.promptVersion,
              },
            },
          });
        } else {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { personalizationStatus: "FAILED", errorCode: "PERSONALIZATION_FAILED", errorMessage: result.error ?? "unknown" },
          });
        }
        await this.recordAiUsage(campaign.organizationId, campaignId, result.tokensUsed, result.costUsd);
      } catch (error: any) {
        this.logger.error(`Personalization crashed for recipient ${recipient.id}: ${error?.message}`);
        await prisma.campaignRecipient
          .update({
            where: { id: recipient.id },
            data: { personalizationStatus: "FAILED", errorCode: "PERSONALIZATION_ERROR", errorMessage: String(error?.message ?? "").slice(0, 500) },
          })
          .catch(() => undefined);
      }
      processed++;
    }

    const remaining = await prisma.campaignRecipient.count({
      where: { campaignId, isTest: false, personalizationStatus: "PENDING", status: { in: ["PENDING", "READY", "QUEUED"] } },
    });
    if (remaining === 0 && campaign.status === "PREPARING") {
      await prisma.campaign.updateMany({ where: { id: campaignId, status: "PREPARING" }, data: { status: "READY" } });
    }

    return { processed, done: remaining === 0 };
  }

  /**
   * Send up to `batchSize` QUEUED recipients of a RUNNING campaign, honoring
   * the configured inter-send delay. Auto-completes the campaign when the
   * queue drains. All authority checks live in MarketingSendService.
   */
  async dispatchBatch(campaignId: string, batchSize = 10): Promise<{ sent: number; done: boolean }> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== "RUNNING") return { sent: 0, done: true };

    const settings = await this.settings.getOrCreate(campaign.organizationId);
    const queued = await prisma.campaignRecipient.findMany({
      where: { campaignId, isTest: false, status: "QUEUED" },
      select: { id: true },
      take: batchSize,
    });

    let sent = 0;
    for (const recipient of queued) {
      const fresh = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (fresh?.status !== "RUNNING") break;

      const outcome = await this.sender.sendToRecipient(recipient.id);
      if (outcome.sent) sent++;
      if (outcome.skippedReason === "KILL_SWITCH" || outcome.skippedReason === "WHATSAPP_NOT_READY" || outcome.skippedReason === "ENTITLEMENT_DISABLED") {
        // stop this batch; the campaign should pause via the guard elsewhere
        break;
      }
      if (settings.sendDelaySeconds > 0) {
        await sleep(settings.sendDelaySeconds * 1000 + Math.floor(Math.random() * 500));
      }
    }

    const remaining = await prisma.campaignRecipient.count({ where: { campaignId, isTest: false, status: "QUEUED" } });
    const inFlight = await prisma.campaignRecipient.count({ where: { campaignId, isTest: false, status: "SENDING" } });
    if (remaining === 0 && inFlight === 0) {
      await prisma.campaign.updateMany({ where: { id: campaignId, status: "RUNNING" }, data: { status: "COMPLETED", completedAt: new Date() } });
      return { sent, done: true };
    }
    return { sent, done: false };
  }

  private async recordAiUsage(organizationId: string, campaignId: string, tokens: number, costUsd: number) {
    if (!tokens && !costUsd) return;
    await prisma.usageEvent
      .create({
        data: {
          organizationId,
          featureKey: "AI_PERSONALIZATION",
          quantity: tokens,
          idempotencyKey: `personalization-${campaignId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          metadata: { campaignId, costUsd },
        },
      })
      .catch(() => undefined);
  }

  private async isOverBudget(organizationId: string, settings: any): Promise<boolean> {
    if (!settings.dailyAiBudgetMinor && !settings.monthlyAiBudgetMinor) return false;
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const sumCost = async (since: Date) => {
      const events = await prisma.usageEvent.findMany({
        where: { organizationId, featureKey: "AI_PERSONALIZATION", createdAt: { gte: since } },
        select: { metadata: true },
      });
      const usd = events.reduce((acc, e) => acc + (Number((e.metadata as any)?.costUsd) || 0), 0);
      return Math.round(usd * 375 * 100); // USD → SAR halalas, approx 3.75 SAR/USD
    };

    if (settings.dailyAiBudgetMinor && (await sumCost(dayStart)) >= settings.dailyAiBudgetMinor) return true;
    if (settings.monthlyAiBudgetMinor && (await sumCost(monthStart)) >= settings.monthlyAiBudgetMinor) return true;
    return false;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v) => typeof v === "string");
  }
}
