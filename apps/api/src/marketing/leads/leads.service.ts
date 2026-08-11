import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, normalizePhone, normalizePhoneStrict } from "@qanoai/shared";
import { discoverLeadsSchema } from "@qanoai/validation";
import { AuditService } from "../../audit/audit.service";
import { MarketingSettingsService } from "../settings/marketing-settings.service";
import { GooglePlacesDiscoveryProvider } from "../discovery/google-places.provider";
import { MockDiscoveryProvider } from "../discovery/mock-discovery.provider";
import { DiscoveredLead, LeadDiscoveryProvider } from "../discovery/lead-discovery.provider";
import { DncService } from "../dnc/dnc.service";

export interface LeadEligibility {
  eligible: boolean;
  reason?: "DNC" | "DUPLICATE" | "PREVIOUSLY_CONTACTED" | "ACTIVE_CAMPAIGN" | "INVALID_PHONE";
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly settings: MarketingSettingsService,
    private readonly dnc: DncService,
    private readonly googleProvider: GooglePlacesDiscoveryProvider,
    private readonly mockProvider: MockDiscoveryProvider
  ) {}

  private async resolveProvider(organizationId: string): Promise<LeadDiscoveryProvider> {
    const settings = await this.settings.getOrCreate(organizationId);
    return settings.discoveryProvider === "GOOGLE_PLACES" ? this.googleProvider : this.mockProvider;
  }

  async getProviderStatus(organizationId: string) {
    const provider = await this.resolveProvider(organizationId);
    return { provider: provider.id, status: await provider.getStatus() };
  }

  async list(organizationId: string, opts: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(opts.page ?? 1, 1);
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const where: any = { organizationId };
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { businessName: { contains: opts.search, mode: "insensitive" } },
        { normalizedPhone: { contains: opts.search.replace(/\D/g, "") || opts.search } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.lead.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(organizationId: string, id: string) {
    const lead = await prisma.lead.findFirst({
      where: { id, organizationId },
      include: { transitions: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!lead) throw new NotFoundException("LEAD_NOT_FOUND");
    return lead;
  }

  /**
   * Run discovery via the configured provider and persist eligible leads.
   * Skips: no phone, invalid phone, duplicates (same normalized identity),
   * DNC numbers. Returns real per-category counts — nothing fabricated.
   */
  async discover(dto: unknown, actorUserId: string) {
    const parsed = discoverLeadsSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const { organizationId, productId, businessType, city, requestedCount } = parsed.data;

    const product = await prisma.salesProduct.findFirst({
      where: { id: productId, organizationId, deletedAt: null },
    });
    if (!product) throw new BadRequestException("PRODUCT_NOT_FOUND");

    const settings = await this.settings.getOrCreate(organizationId);
    const cappedCount = Math.min(requestedCount, settings.maxLeadsPerCampaign);

    const provider = await this.resolveProvider(organizationId);
    const status = await provider.getStatus();
    if (status === "CONFIGURATION_REQUIRED") {
      throw new BadRequestException("DISCOVERY_PROVIDER_CONFIGURATION_REQUIRED");
    }

    let discovered: DiscoveredLead[];
    try {
      discovered = await provider.discover({ businessType, city, requestedCount: cappedCount });
    } catch (error: any) {
      this.logger.error(`Discovery failed: ${error?.message}`);
      throw new BadRequestException("DISCOVERY_PROVIDER_ERROR");
    }

    const counts = { found: discovered.length, created: 0, duplicates: 0, dnc: 0, invalidPhone: 0 };
    const createdLeadIds: string[] = [];

    for (const item of discovered) {
      const { normalized, valid } = normalizePhoneStrict(item.phone);
      if (!valid) {
        counts.invalidPhone++;
        continue;
      }
      if (await this.dnc.isBlocked(organizationId, item.phone)) {
        counts.dnc++;
        continue;
      }
      const existing = await prisma.lead.findUnique({
        where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
      });
      if (existing) {
        counts.duplicates++;
        continue;
      }
      const lead = await prisma.lead.create({
        data: {
          organizationId,
          businessName: item.businessName,
          rawPhone: item.phone,
          normalizedPhone: normalized,
          legacyNormalizedPhone: normalizePhone(item.phone),
          website: item.website ?? null,
          city: item.city ?? city,
          businessType,
          source: provider.id === "GOOGLE_PLACES" ? "GOOGLE_PLACES" : "MOCK",
          providerId: provider.id,
          providerRef: item.providerRef ?? null,
          status: "DISCOVERED",
        },
      });
      await prisma.leadStateTransition.create({
        data: { leadId: lead.id, fromStatus: "NONE", toStatus: "DISCOVERED", source: provider.id },
      });
      createdLeadIds.push(lead.id);
      counts.created++;
    }

    await prisma.usageEvent
      .create({
        data: {
          organizationId,
          featureKey: "LEAD_DISCOVERY",
          quantity: discovered.length,
          idempotencyKey: `discovery-${generateCorrelationId()}`,
          metadata: { provider: provider.id, businessType, city },
        },
      })
      .catch(() => undefined);

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "MARKETING_LEADS_DISCOVERED",
      resourceType: "Lead",
      metadata: { provider: provider.id, providerStatus: status, businessType, city, ...counts },
      correlationId: generateCorrelationId(),
    });

    return { provider: provider.id, providerStatus: status, ...counts, leadIds: createdLeadIds };
  }

  /**
   * Campaign-enrollment eligibility for one lead. DNC and previous-contact
   * rules are also re-checked server-side at send time; this is the
   * planning-time filter.
   */
  async checkEligibility(organizationId: string, leadId: string): Promise<LeadEligibility> {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
    if (!lead) return { eligible: false, reason: "INVALID_PHONE" };

    if (!normalizePhoneStrict(lead.rawPhone).valid) return { eligible: false, reason: "INVALID_PHONE" };
    if (lead.status === "DO_NOT_CONTACT") return { eligible: false, reason: "DNC" };
    if (await this.dnc.isBlocked(organizationId, lead.normalizedPhone)) return { eligible: false, reason: "DNC" };

    // previously contacted by any campaign (sent or replied) → owner override required
    const previous = await prisma.campaignRecipient.findFirst({
      where: { leadId: lead.id, isTest: false, status: { in: ["SENT", "REPLIED"] } },
    });
    if (previous) return { eligible: false, reason: "PREVIOUSLY_CONTACTED" };

    // currently enrolled in an active campaign
    const active = await prisma.campaignRecipient.findFirst({
      where: {
        leadId: lead.id,
        isTest: false,
        status: { in: ["PENDING", "READY", "QUEUED", "SENDING"] },
        campaign: { status: { in: ["DRAFT", "PREPARING", "READY", "RUNNING", "PAUSED"] } },
      },
    });
    if (active) return { eligible: false, reason: "ACTIVE_CAMPAIGN" };

    return { eligible: true };
  }

  async transition(leadId: string, toStatus: string, reason: string, source: string) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.status === toStatus) return lead;
    const updated = await prisma.lead.update({ where: { id: leadId }, data: { status: toStatus } });
    await prisma.leadStateTransition.create({
      data: { leadId, fromStatus: lead.status, toStatus, reason, source },
    });
    return updated;
  }
}
