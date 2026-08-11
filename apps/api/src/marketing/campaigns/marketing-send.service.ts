import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { normalizePhone } from "@qanoai/shared";
import { EvolutionProvider } from "../../whatsapp/providers/evolution.provider";
import { DncService } from "../dnc/dnc.service";
import { MarketingSettingsService } from "../settings/marketing-settings.service";
import { MarketingEntitlementsService } from "../entitlements.service";
import { MARKETING_CAPABILITIES } from "@qanoai/permissions";
import { OutboundGuardService } from "../../whatsapp/outbound-guard.service";

export interface SendOutcome {
  sent: boolean;
  skippedReason?: string;
  error?: string;
  messageId?: string;
  conversationId?: string;
}

/**
 * The single authorized send path for marketing messages.
 *
 * Every send re-validates FRESH server state immediately before hitting
 * the provider: entitlement, kill switch, campaign RUNNING, atomic
 * recipient claim (QUEUED→SENDING), DNC, contact opt-out. The queue/loop
 * payload is never trusted. The existing support send paths are untouched.
 */
@Injectable()
export class MarketingSendService {
  private readonly logger = new Logger(MarketingSendService.name);

  constructor(private readonly outboundGuard: OutboundGuardService, 
    private readonly evolutionProvider: EvolutionProvider,
    private readonly dnc: DncService,
    private readonly settings: MarketingSettingsService,
    private readonly entitlements: MarketingEntitlementsService
  ) {}

  async sendToRecipient(recipientId: string): Promise<SendOutcome> {
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: { campaign: true, lead: true },
    });
    if (!recipient || recipient.isTest) return { sent: false, skippedReason: "RECIPIENT_NOT_FOUND" };
    const { campaign, lead } = recipient;
    const organizationId = campaign.organizationId;

    // ---- fresh server-state gate (queue payload is not authority) ----
    if (campaign.status !== "RUNNING") return { sent: false, skippedReason: "CAMPAIGN_NOT_RUNNING" };
    if (!(await this.entitlements.isEnabled(organizationId, MARKETING_CAPABILITIES.AI_SALES_MODULE))) {
      return { sent: false, skippedReason: "ENTITLEMENT_DISABLED" };
    }
    if (await this.settings.isKillSwitchOn(organizationId)) {
      return { sent: false, skippedReason: "KILL_SWITCH" };
    }
    if (await this.dnc.isBlocked(organizationId, lead.normalizedPhone)) {
      await this.markSkipped(recipient.id, "SKIPPED_DNC");
      return { sent: false, skippedReason: "DNC" };
    }
    if (!recipient.personalizedMessage || recipient.personalizationStatus !== "READY") {
      return { sent: false, skippedReason: "PERSONALIZATION_NOT_READY" };
    }

    const connection = await this.resolveConnection(organizationId, campaign.channelConnectionId);
    if (!connection?.providerInstanceId || connection.status !== "CONNECTED") {
      return { sent: false, skippedReason: "WHATSAPP_NOT_READY" };
    }

    // ---- atomic claim: QUEUED → SENDING. A concurrent reply that marked
    // the row REPLIED (or any other state change) makes this a no-op. ----
    const claimed = await prisma.campaignRecipient.updateMany({
      where: { id: recipient.id, status: "QUEUED" },
      data: { status: "SENDING", lastAttemptAt: new Date(), attemptCount: { increment: 1 } },
    });
    if (claimed.count === 0) return { sent: false, skippedReason: "NOT_CLAIMABLE" };

    // Re-check campaign state after the claim to close the pause race.
    const freshCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id }, select: { status: true } });
    if (freshCampaign?.status !== "RUNNING") {
      await prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: "SENDING" },
        data: { status: "QUEUED" },
      });
      return { sent: false, skippedReason: "CAMPAIGN_NOT_RUNNING" };
    }

    try {
      // Resolve Contact via the LEGACY normalization (existing Inbox identity).
      const legacyPhone = lead.legacyNormalizedPhone || normalizePhone(lead.rawPhone);
      let contact = await prisma.contact.findUnique({
        where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: legacyPhone } },
      });
      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            organizationId,
            primaryPhone: lead.rawPhone,
            normalizedPhone: legacyPhone,
            name: lead.businessName,
            source: "MARKETING",
            consentStatus: "UNKNOWN",
          },
        });
      }
      if (contact.marketingOptOutAt || contact.consentStatus === "OPTED_OUT") {
        await this.markSkipped(recipient.id, "SKIPPED_DNC");
        return { sent: false, skippedReason: "CONTACT_OPTED_OUT" };
      }

      // The shared gate: kill switch, DNC, daily ceiling, per-contact frequency
      // and quiet hours, all in one place. Checked per recipient rather than
      // once per campaign, so a limit reached mid-run stops the rest of it.
      const gate = await this.outboundGuard.check({
        organizationId,
        toPhone: lead.rawPhone,
        kind: "MARKETING",
        contactId: contact.id,
      });
      if (!gate.allowed) {
        await this.markSkipped(recipient.id, `SKIPPED_${gate.reason}`);
        return { sent: false, skippedReason: gate.reason };
      }
      if (lead.contactId !== contact.id) {
        await prisma.lead.update({ where: { id: lead.id }, data: { contactId: contact.id } });
      }

      // Conversation with sales context — reuse an open one if it exists so
      // the EXISTING inbox stays the single surface.
      let conversation = await prisma.conversation.findFirst({
        where: {
          organizationId,
          contactId: contact.id,
          status: { notIn: ["RESOLVED", "CLOSED", "SPAM", "BLOCKED"] },
        },
      });
      const salesContext = { campaignId: campaign.id, leadId: lead.id, productId: campaign.productId, recipientId: recipient.id };
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            organizationId,
            channelConnectionId: connection.id,
            contactId: contact.id,
            status: "OPEN",
            mode: "AI_AUTOMATIC",
            metadata: { salesContext },
          },
        });
      } else {
        const metadata = { ...((conversation.metadata as any) ?? {}), salesContext };
        conversation = await prisma.conversation.update({ where: { id: conversation.id }, data: { metadata } });
      }

      const message = await prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          channelConnectionId: connection.id,
          contactId: contact.id,
          direction: "OUTBOUND",
          senderType: "AI_AGENT",
          messageType: "TEXT",
          text: recipient.personalizedMessage,
          providerStatus: "PENDING",
          isAiGenerated: true,
          isMarketing: true,
          metadata: { campaignId: campaign.id, recipientId: recipient.id, kind: "MARKETING_OUTREACH" },
        },
      });

      // Send to the LEAD's strictly-normalised number, not the contact's legacy
      // one.
      //
      // The contact row is matched by `normalizePhone`, the older and looser
      // function kept for inbox identity. The lead carries `normalizedPhone`
      // from `normalizePhoneStrict`, which is what was validated on import. When
      // the two disagree — and they disagree exactly on the malformed numbers
      // where it matters — the message went to whatever the loose function
      // produced. That is how a campaign reaches a number nobody entered.
      const sendToPhone = lead.normalizedPhone || contact.normalizedPhone;
      if (!sendToPhone) {
        await this.markSkipped(recipient.id, "SKIPPED_NO_VALID_PHONE");
        return { sent: false, skippedReason: "NO_VALID_PHONE" };
      }

      const result = await this.evolutionProvider.sendText({
        instanceId: connection.providerInstanceId,
        phoneNumber: sendToPhone,
        text: recipient.personalizedMessage,
      });

      await prisma.message.update({
        where: { id: message.id },
        data: { providerStatus: "SENT", providerMessageId: result.messageId, sentAt: new Date() },
      });
      // guard the SENDING → SENT transition too: a reply may have landed mid-send
      await prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: "SENDING" },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.messageId,
          messageId: message.id,
          conversationId: conversation.id,
          errorCode: null,
          errorMessage: null,
        },
      });
      await prisma.campaign.update({ where: { id: campaign.id }, data: { sentCount: { increment: 1 } } });

      const currentLead = await prisma.lead.findUnique({ where: { id: lead.id }, select: { status: true } });
      if (currentLead && ["DISCOVERED", "ELIGIBLE"].includes(currentLead.status)) {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED" } });
        await prisma.leadStateTransition.create({
          data: { leadId: lead.id, fromStatus: currentLead.status, toStatus: "CONTACTED", source: "CAMPAIGN", reason: campaign.id },
        });
      }

      return { sent: true, messageId: message.id, conversationId: conversation.id };
    } catch (error: any) {
      const errorMessage = String(error?.message ?? "SEND_FAILED").slice(0, 500);
      this.logger.error(`Campaign send failed for recipient ${recipient.id}: ${errorMessage}`);
      await prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: "SENDING" },
        data: { status: "FAILED", errorCode: "PROVIDER_ERROR", errorMessage },
      });
      await prisma.campaign.update({ where: { id: campaign.id }, data: { failedCount: { increment: 1 } } });
      return { sent: false, error: errorMessage };
    }
  }

  /**
   * Isolated test send to the owner-configured test number. Never touches
   * campaign counters, recipient state, lead state, or analytics; records
   * a separate isTest recipient row and returns the real provider result.
   */
  async sendTest(organizationId: string, campaignId: string, recipientId: string): Promise<SendOutcome> {
    const settings = await this.settings.getOrCreate(organizationId);
    if (!settings.testPhoneNumber) return { sent: false, skippedReason: "TEST_NUMBER_NOT_CONFIGURED" };
    if (settings.killSwitchEnabled) return { sent: false, skippedReason: "KILL_SWITCH" };

    const recipient = await prisma.campaignRecipient.findFirst({
      where: { id: recipientId, campaignId, isTest: false, campaign: { organizationId } },
      include: { campaign: true, lead: true },
    });
    if (!recipient?.personalizedMessage) return { sent: false, skippedReason: "PERSONALIZATION_NOT_READY" };

    const connection = await this.resolveConnection(organizationId, recipient.campaign.channelConnectionId);
    if (!connection?.providerInstanceId || connection.status !== "CONNECTED") {
      return { sent: false, skippedReason: "WHATSAPP_NOT_READY" };
    }

    const testRow = await prisma.campaignRecipient.upsert({
      where: { campaignId_leadId_isTest: { campaignId, leadId: recipient.leadId, isTest: true } },
      update: { personalizedMessage: recipient.personalizedMessage, status: "SENDING", lastAttemptAt: new Date() },
      create: {
        campaignId,
        leadId: recipient.leadId,
        isTest: true,
        status: "SENDING",
        personalizationStatus: "READY",
        personalizedMessage: recipient.personalizedMessage,
      },
    });

    try {
      const result = await this.evolutionProvider.sendText({
        instanceId: connection.providerInstanceId,
        phoneNumber: settings.testPhoneNumber,
        text: `«تجربة حملة»\n\n${recipient.personalizedMessage}`,
      });
      await prisma.campaignRecipient.update({
        where: { id: testRow.id },
        data: { status: "SENT", sentAt: new Date(), providerMessageId: result.messageId },
      });
      return { sent: true, messageId: result.messageId };
    } catch (error: any) {
      const errorMessage = String(error?.message ?? "SEND_FAILED").slice(0, 500);
      await prisma.campaignRecipient.update({
        where: { id: testRow.id },
        data: { status: "FAILED", errorCode: "PROVIDER_ERROR", errorMessage },
      });
      return { sent: false, error: errorMessage };
    }
  }

  async resolveConnection(organizationId: string, preferredId?: string | null) {
    if (preferredId) {
      const preferred = await prisma.channelConnection.findFirst({
        where: { id: preferredId, organizationId, deletedAt: null },
      });
      if (preferred) return preferred;
    }
    return prisma.channelConnection.findFirst({
      where: { organizationId, deletedAt: null, status: "CONNECTED" },
      orderBy: { lastConnectedAt: "desc" },
    });
  }

  private async markSkipped(recipientId: string, status: string) {
    await prisma.campaignRecipient.updateMany({
      where: { id: recipientId, status: { in: ["PENDING", "READY", "QUEUED", "SENDING"] } },
      data: { status },
    });
  }
}
