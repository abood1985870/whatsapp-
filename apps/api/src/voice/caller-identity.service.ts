import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { normalizePhone, normalizePhoneStrict } from "@qanoai/shared";

export interface ResolvedCaller {
  contactId: string | null;
  leadId: string | null;
  productId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  contactName: string | null;
  businessName: string | null;
  leadStatus: string | null;
  previousInterest: string | null;
  isKnownCustomer: boolean;
  isDoNotContact: boolean;
}

/**
 * One customer across every channel.
 *
 * Contacts are keyed by the LEGACY `normalizePhone` (that is what the
 * existing inbox and WhatsApp pipeline use, so reusing it is what prevents
 * duplicate customer identities). Leads and DNC use `normalizePhoneStrict`,
 * matching the marketing module. Both are derived from the same raw number.
 */
@Injectable()
export class CallerIdentityService {
  async resolve(organizationId: string, rawPhone: string, options?: { createIfMissing?: boolean }): Promise<ResolvedCaller> {
    const legacyPhone = normalizePhone(rawPhone);
    const { normalized: strictPhone } = normalizePhoneStrict(rawPhone);

    let contact = await prisma.contact.findUnique({
      where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: legacyPhone } },
    });

    let lead = strictPhone
      ? await prisma.lead.findUnique({
          where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: strictPhone } },
        })
      : null;

    const knownBefore = Boolean(contact || lead);

    if (!contact && options?.createIfMissing) {
      contact = await prisma.contact.create({
        data: {
          organizationId,
          primaryPhone: rawPhone,
          normalizedPhone: legacyPhone,
          source: "VOICE",
          consentStatus: "UNKNOWN",
          firstSeenAt: new Date(),
        },
      });
    }
    if (contact) {
      await prisma.contact.update({ where: { id: contact.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }

    if (!lead && options?.createIfMissing && strictPhone) {
      lead = await prisma.lead.create({
        data: {
          organizationId,
          businessName: contact?.company || contact?.name || "متصل جديد",
          rawPhone,
          normalizedPhone: strictPhone,
          legacyNormalizedPhone: legacyPhone,
          source: "VOICE_INBOUND",
          status: "REPLIED",
          contactId: contact?.id ?? null,
        },
      });
      await prisma.leadStateTransition.create({
        data: { leadId: lead.id, fromStatus: "NONE", toStatus: "REPLIED", source: "VOICE", reason: "inbound call" },
      });
    }

    if (lead && contact && lead.contactId !== contact.id) {
      await prisma.lead.update({ where: { id: lead.id }, data: { contactId: contact.id } }).catch(() => undefined);
    }

    // Most recent campaign this lead was enrolled in — gives the voice agent
    // the right product context when a marketing recipient calls back.
    let campaignId: string | null = null;
    let campaignName: string | null = null;
    let productId: string | null = null;
    if (lead) {
      const recipient = await prisma.campaignRecipient.findFirst({
        where: { leadId: lead.id, isTest: false },
        orderBy: { updatedAt: "desc" },
        include: { campaign: { select: { id: true, name: true, productId: true } } },
      });
      if (recipient?.campaign) {
        campaignId = recipient.campaign.id;
        campaignName = recipient.campaign.name;
        productId = recipient.campaign.productId;
      }
    }

    const isDoNotContact = strictPhone
      ? Boolean(
          await prisma.dncEntry.findUnique({
            where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: strictPhone } },
          })
        )
      : false;

    let previousInterest: string | null = null;
    if (productId) {
      const product = await prisma.salesProduct.findUnique({ where: { id: productId }, select: { nameArabic: true } });
      previousInterest = product?.nameArabic ?? null;
    }

    return {
      contactId: contact?.id ?? null,
      leadId: lead?.id ?? null,
      productId,
      campaignId,
      campaignName,
      contactName: contact?.name ?? null,
      businessName: contact?.company ?? lead?.businessName ?? null,
      leadStatus: lead?.status ?? null,
      previousInterest,
      isKnownCustomer: knownBefore,
      isDoNotContact,
    };
  }

  /** Chronological cross-channel timeline assembled from existing rows only. */
  async timeline(organizationId: string, contactId: string, limit = 50) {
    const [messages, calls, recipients] = await Promise.all([
      prisma.message.findMany({
        where: { organizationId, contactId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, direction: true, text: true, createdAt: true, senderType: true },
      }),
      prisma.call.findMany({
        where: { organizationId, contactId },
        orderBy: { startedAt: "desc" },
        take: limit,
        select: { id: true, status: true, salesOutcome: true, durationSeconds: true, startedAt: true, summary: true },
      }),
      prisma.campaignRecipient.findMany({
        where: { lead: { organizationId, contactId } },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: { id: true, status: true, sentAt: true, campaign: { select: { name: true } } },
      }),
    ]);

    const events = [
      ...messages.map((m) => ({
        type: "MESSAGE" as const,
        at: m.createdAt,
        id: m.id,
        detail: { direction: m.direction, senderType: m.senderType, text: m.text?.slice(0, 300) },
      })),
      ...calls.map((c) => ({
        type: "CALL" as const,
        at: c.startedAt,
        id: c.id,
        detail: { status: c.status, outcome: c.salesOutcome, durationSeconds: c.durationSeconds, summary: c.summary?.slice(0, 300) },
      })),
      ...recipients.map((r) => ({
        type: "CAMPAIGN" as const,
        at: r.sentAt ?? new Date(0),
        id: r.id,
        detail: { status: r.status, campaign: r.campaign?.name },
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return events.slice(0, limit);
  }
}
