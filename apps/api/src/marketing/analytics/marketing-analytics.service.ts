import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";

/**
 * All figures come from real database aggregates. Delivered/Read are
 * reported only when the provider actually populated them; otherwise the
 * caller shows "غير متاح من مزود الاتصال الحالي". Nothing is fabricated.
 */
@Injectable()
export class MarketingAnalyticsService {
  async overview(organizationId: string) {
    const [leadTotal, leadByStatus, campaignByStatus, dncCount, recipientByStatus, hotLeads, customRequests] =
      await Promise.all([
        prisma.lead.count({ where: { organizationId } }),
        prisma.lead.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
        prisma.campaign.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
        prisma.dncEntry.count({ where: { organizationId, isActive: true } }),
        prisma.campaignRecipient.groupBy({
          by: ["status"],
          where: { isTest: false, campaign: { organizationId } },
          _count: { _all: true },
        }),
        prisma.lead.count({ where: { organizationId, status: { in: ["HOT", "READY_TO_BUY"] } } }),
        prisma.customSoftwareRequest.count({ where: { organizationId } }),
      ]);

    const recipients = Object.fromEntries(recipientByStatus.map((r) => [r.status, r._count._all]));
    const sent = recipients.SENT ?? 0;
    const replied = recipients.REPLIED ?? 0;
    const interested = await prisma.lead.count({ where: { organizationId, status: { in: ["INTERESTED", "HOT", "READY_TO_BUY", "WON"] } } });
    const won = leadByStatus.find((l) => l.status === "WON")?._count._all ?? 0;

    // Delivered/Read availability from actual message rows.
    const [deliveredKnown, readKnown] = await Promise.all([
      prisma.message.count({ where: { organizationId, direction: "OUTBOUND", deliveredAt: { not: null } } }),
      prisma.message.count({ where: { organizationId, direction: "OUTBOUND", readAt: { not: null } } }),
    ]);

    return {
      leads: { total: leadTotal, byStatus: Object.fromEntries(leadByStatus.map((l) => [l.status, l._count._all])) },
      campaigns: Object.fromEntries(campaignByStatus.map((c) => [c.status, c._count._all])),
      recipients,
      dncCount,
      hotLeads,
      customRequests,
      funnel: {
        sent,
        replied,
        interested,
        won,
        replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
        interestRate: sent > 0 ? Math.round((interested / sent) * 1000) / 10 : 0,
        conversionRate: sent > 0 ? Math.round((won / sent) * 1000) / 10 : 0,
      },
      deliveryMetrics: {
        deliveredAvailable: deliveredKnown > 0,
        readAvailable: readKnown > 0,
        note: deliveredKnown > 0 ? undefined : "غير متاح من مزود الاتصال الحالي",
      },
    };
  }
}
