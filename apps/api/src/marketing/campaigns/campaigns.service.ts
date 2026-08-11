import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { createCampaignSchema } from "@qanoai/validation";
import { AuditService } from "../../audit/audit.service";
import { LeadsService } from "../leads/leads.service";
import { MarketingSettingsService } from "../settings/marketing-settings.service";
import { MarketingSendService } from "./marketing-send.service";

@Injectable()
export class CampaignsService {
  constructor(
    private readonly audit: AuditService,
    private readonly leads: LeadsService,
    private readonly settings: MarketingSettingsService,
    private readonly sender: MarketingSendService
  ) {}

  async list(organizationId: string, page = 1, limit = 25) {
    const skip = (Math.max(page, 1) - 1) * limit;
    const where = { organizationId };
    const [items, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { product: { select: { nameArabic: true } } },
      }),
      prisma.campaign.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async detail(organizationId: string, id: string, recipientPage = 1, recipientLimit = 50) {
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId },
      include: { product: { select: { id: true, nameArabic: true, priceMinor: true, currency: true } } },
    });
    if (!campaign) throw new NotFoundException("CAMPAIGN_NOT_FOUND");

    const skip = (Math.max(recipientPage, 1) - 1) * recipientLimit;
    const [recipients, recipientTotal, statusCounts] = await Promise.all([
      prisma.campaignRecipient.findMany({
        where: { campaignId: id, isTest: false },
        include: { lead: { select: { businessName: true, rawPhone: true, website: true, status: true } } },
        orderBy: { createdAt: "asc" },
        skip,
        take: recipientLimit,
      }),
      prisma.campaignRecipient.count({ where: { campaignId: id, isTest: false } }),
      prisma.campaignRecipient.groupBy({
        by: ["status"],
        where: { campaignId: id, isTest: false },
        _count: { _all: true },
      }),
    ]);

    return {
      campaign,
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
      recipients: {
        items: recipients,
        total: recipientTotal,
        page: recipientPage,
        limit: recipientLimit,
        totalPages: Math.ceil(recipientTotal / recipientLimit),
      },
    };
  }

  /**
   * Create a campaign and enroll leads. Every lead passes the eligibility
   * pipeline; ineligible ones are recorded as SKIPPED_* rows so the
   * numbers stay honest. Respects safeCampaignMode canary cap.
   */
  async create(dto: unknown, actorUserId: string, options?: { overridePreviousContact?: boolean }) {
    const parsed = createCampaignSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const product = await prisma.salesProduct.findFirst({
      where: { id: data.productId, organizationId: data.organizationId, deletedAt: null, aiSalesEnabled: true },
    });
    if (!product) throw new BadRequestException("PRODUCT_NOT_FOUND_OR_DISABLED");
    if (data.leadIds.length === 0) throw new BadRequestException("NO_LEADS_SELECTED");

    const settings = await this.settings.getOrCreate(data.organizationId);
    const overridePrevious = options?.overridePreviousContact === true;

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        productId: data.productId,
        targetBusinessType: data.targetBusinessType ?? null,
        city: data.city ?? null,
        requestedLeadCount: data.leadIds.length,
        salesContext: data.salesContext ?? null,
        channelConnectionId: data.channelConnectionId ?? null,
        status: "DRAFT",
        createdById: actorUserId,
      },
    });

    let enrolled = 0;
    let skipped = 0;
    const eligibleCap = settings.safeCampaignMode ? settings.canaryMaxRecipients : settings.maxLeadsPerCampaign;

    for (const leadId of data.leadIds) {
      const eligibility = await this.leads.checkEligibility(data.organizationId, leadId);
      let status: string;
      if (eligibility.eligible) {
        status = enrolled < eligibleCap ? "PENDING" : "SKIPPED_DUPLICATE";
        if (enrolled < eligibleCap) enrolled++;
        else skipped++;
      } else if (eligibility.reason === "PREVIOUSLY_CONTACTED" && overridePrevious) {
        status = enrolled < eligibleCap ? "PENDING" : "SKIPPED_DUPLICATE";
        if (enrolled < eligibleCap) enrolled++;
        else skipped++;
      } else {
        status =
          eligibility.reason === "DNC"
            ? "SKIPPED_DNC"
            : eligibility.reason === "PREVIOUSLY_CONTACTED"
              ? "SKIPPED_PREVIOUS_CONTACT"
              : "SKIPPED_DUPLICATE";
        skipped++;
      }
      try {
        await prisma.campaignRecipient.create({
          data: { campaignId: campaign.id, leadId, status, personalizationStatus: "PENDING" },
        });
      } catch {
        skipped++; // duplicate lead id in the list
      }
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { totalRecipients: enrolled, skippedCount: skipped },
    });

    await this.audit.log({
      organizationId: data.organizationId,
      actorUserId,
      action: "MARKETING_CAMPAIGN_CREATED",
      resourceType: "Campaign",
      resourceId: campaign.id,
      metadata: { name: data.name, productId: data.productId, enrolled, skipped, overridePrevious },
      correlationId: generateCorrelationId(),
    });
    if (overridePrevious) {
      await this.audit.log({
        organizationId: data.organizationId,
        actorUserId,
        action: "MARKETING_PREVIOUS_CONTACT_OVERRIDE",
        resourceType: "Campaign",
        resourceId: campaign.id,
        correlationId: generateCorrelationId(),
      });
    }

    return updated;
  }

  /** DRAFT → PREPARING: the dispatcher generates personalizations in the background. */
  async prepare(organizationId: string, id: string, actorUserId: string) {
    const result = await prisma.campaign.updateMany({
      where: { id, organizationId, status: "DRAFT" },
      data: { status: "PREPARING" },
    });
    if (result.count === 0) throw new BadRequestException("CAMPAIGN_NOT_IN_DRAFT");
    await this.auditAction(organizationId, actorUserId, id, "MARKETING_CAMPAIGN_PREPARING");
    return this.getOwned(organizationId, id);
  }

  /** Atomic start guard: only READY or PAUSED campaigns start; double clicks lose the race. */
  async start(organizationId: string, id: string, actorUserId: string) {
    const executionKey = generateCorrelationId();
    const result = await prisma.campaign.updateMany({
      where: { id, organizationId, status: { in: ["READY", "PAUSED"] } },
      data: { status: "RUNNING", executionKey, startedAt: new Date(), pausedAt: null },
    });
    if (result.count === 0) throw new BadRequestException("CAMPAIGN_NOT_STARTABLE");

    // (Re)queue eligible prepared recipients. Recipients already SENT/REPLIED/skipped are untouched.
    await prisma.campaignRecipient.updateMany({
      where: { campaignId: id, isTest: false, status: { in: ["PENDING", "READY"] }, personalizationStatus: "READY" },
      data: { status: "QUEUED" },
    });

    await this.auditAction(organizationId, actorUserId, id, "MARKETING_CAMPAIGN_STARTED");
    return this.getOwned(organizationId, id);
  }

  async pause(organizationId: string, id: string, actorUserId: string, reason = "MANUAL") {
    const result = await prisma.campaign.updateMany({
      where: { id, organizationId, status: "RUNNING" },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
    if (result.count === 0) throw new BadRequestException("CAMPAIGN_NOT_RUNNING");
    await this.auditAction(organizationId, actorUserId, id, "MARKETING_CAMPAIGN_PAUSED", { reason });
    return this.getOwned(organizationId, id);
  }

  async cancel(organizationId: string, id: string, actorUserId: string) {
    const result = await prisma.campaign.updateMany({
      where: { id, organizationId, status: { in: ["DRAFT", "PREPARING", "READY", "RUNNING", "PAUSED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (result.count === 0) throw new BadRequestException("CAMPAIGN_NOT_CANCELLABLE");
    await prisma.campaignRecipient.updateMany({
      where: { campaignId: id, isTest: false, status: { in: ["PENDING", "READY", "QUEUED"] } },
      data: { status: "CANCELLED" },
    });
    await this.auditAction(organizationId, actorUserId, id, "MARKETING_CAMPAIGN_CANCELLED");
    return this.getOwned(organizationId, id);
  }

  /**
   * Dry run: the full pipeline report with zero provider sends.
   * Recomputes fresh eligibility for every non-final recipient.
   */
  async dryRun(organizationId: string, id: string) {
    const campaign = await this.getOwned(organizationId, id);
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, isTest: false },
      include: { lead: { select: { id: true, businessName: true, normalizedPhone: true, website: true } } },
    });

    const report = {
      wouldSend: 0,
      dnc: 0,
      previouslyContacted: 0,
      duplicates: 0,
      personalizationPending: 0,
      personalizationFailed: 0,
      alreadySent: 0,
      replied: 0,
      other: 0,
    };

    for (const r of recipients) {
      if (r.status === "SENT") { report.alreadySent++; continue; }
      if (r.status === "REPLIED") { report.replied++; continue; }
      if (r.status === "SKIPPED_DNC") { report.dnc++; continue; }
      if (r.status === "SKIPPED_PREVIOUS_CONTACT") { report.previouslyContacted++; continue; }
      if (r.status === "SKIPPED_DUPLICATE" || r.status === "CANCELLED") { report.duplicates++; continue; }

      const eligibility = await this.leads.checkEligibility(organizationId, r.leadId);
      if (!eligibility.eligible && eligibility.reason === "DNC") { report.dnc++; continue; }
      if (r.personalizationStatus === "FAILED") { report.personalizationFailed++; continue; }
      if (r.personalizationStatus !== "READY") { report.personalizationPending++; continue; }
      report.wouldSend++;
    }

    return { campaignId: campaign.id, status: campaign.status, totals: recipients.length, report };
  }

  /** 3–5 representative prepared messages for owner review. */
  async previewMessages(organizationId: string, id: string) {
    const campaign = await this.getOwned(organizationId, id);
    const ready = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, isTest: false, personalizationStatus: "READY" },
      include: { lead: { select: { businessName: true, website: true } } },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
    return ready.map((r) => ({
      recipientId: r.id,
      businessName: r.lead.businessName,
      website: r.lead.website,
      message: r.personalizedMessage,
      meta: r.personalizationMeta,
    }));
  }

  /** Force personalization regeneration for one recipient (owner adjusting previews). */
  async regeneratePersonalization(organizationId: string, campaignId: string, recipientId: string) {
    const campaign = await this.getOwned(organizationId, campaignId);
    const result = await prisma.campaignRecipient.updateMany({
      where: { id: recipientId, campaignId: campaign.id, isTest: false, status: { in: ["PENDING", "READY"] } },
      data: { personalizationStatus: "PENDING", personalizedMessage: null },
    });
    if (result.count === 0) throw new BadRequestException("RECIPIENT_NOT_REGENERABLE");
    if (campaign.status === "READY") {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PREPARING" } });
    }
    return { ok: true };
  }

  async testSend(organizationId: string, campaignId: string, recipientId: string, actorUserId: string) {
    await this.getOwned(organizationId, campaignId);
    const outcome = await this.sender.sendTest(organizationId, campaignId, recipientId);
    await this.auditAction(organizationId, actorUserId, campaignId, "MARKETING_CAMPAIGN_TEST_SEND", {
      recipientId,
      sent: outcome.sent,
      error: outcome.error,
      skippedReason: outcome.skippedReason,
    });
    return outcome;
  }

  async getOwned(organizationId: string, id: string) {
    const campaign = await prisma.campaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new NotFoundException("CAMPAIGN_NOT_FOUND");
    return campaign;
  }

  private async auditAction(
    organizationId: string,
    actorUserId: string,
    campaignId: string,
    action: string,
    metadata?: Record<string, unknown>
  ) {
    await this.audit.log({
      organizationId,
      actorUserId,
      action,
      resourceType: "Campaign",
      resourceId: campaignId,
      metadata,
      correlationId: generateCorrelationId(),
    });
  }
}
