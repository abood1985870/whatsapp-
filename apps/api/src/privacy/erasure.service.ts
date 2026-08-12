import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, maskPhoneNumber } from "@qanoai/shared";
import { AuditService } from "../audit/audit.service";

/**
 * Erasing one person's data on request.
 *
 * `DataDeletionRequest` has existed as a table with no code behind it: rows
 * could be created and nothing ever acted on them. So the product had a
 * data-deletion feature in the schema and none in reality — a person could ask
 * to be forgotten, the request would be recorded, and their messages, call
 * transcripts and contact record would stay exactly where they were.
 *
 * TOKENIZE vs PURGE is the important distinction:
 *
 *   TOKENIZE (the default) replaces the identifying fields — name, phone,
 *   email, notes, message text, transcript text — while keeping the row
 *   structure. Conversation counts, response times and campaign statistics
 *   stay correct, because deleting the rows outright would silently rewrite
 *   the organization's own history and their reports would change underneath
 *   them.
 *
 *   PURGE deletes the rows. Offered because some requests genuinely require
 *   it, but it is destructive and the analytics consequence is real, so it is
 *   never the default and is recorded in the audit log either way.
 */
@Injectable()
export class ErasureService {
  private readonly logger = new Logger(ErasureService.name);

  constructor(private readonly audit: AuditService) {}

  async eraseContact(input: {
    organizationId: string;
    contactId: string;
    mode: "TOKENIZE" | "PURGE";
    actorUserId: string | null;
    reason?: string;
  }): Promise<any> {
    const { organizationId, contactId, mode } = input;

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { id: true, primaryPhone: true, name: true },
    });
    if (!contact) throw new NotFoundException("CONTACT_NOT_FOUND");
    if (mode !== "TOKENIZE" && mode !== "PURGE") throw new BadRequestException("INVALID_MODE");

    const correlationId = generateCorrelationId();
    const summary =
      mode === "PURGE"
        ? await this.purge(organizationId, contactId)
        : await this.tokenize(organizationId, contactId);

    await this.audit
      .log({
        organizationId,
        actorUserId: input.actorUserId ?? undefined,
        action: `PRIVACY_ERASURE_${mode}`,
        resourceType: "Contact",
        resourceId: contactId,
        // The masked number, so the audit row proves WHICH request was honoured
        // without itself becoming a copy of the data that was just erased.
        metadata: { phone: maskPhoneNumber(contact.primaryPhone), reason: input.reason, ...summary },
        correlationId,
      })
      .catch((e: any) => this.logger.warn(`Erasure audit failed: ${e?.message}`));

    this.logger.log(`Erasure ${mode} completed for contact ${contactId}: ${JSON.stringify(summary)}`);
    return { success: true, mode, ...summary };
  }

  /** Keeps the shape, removes the person. */
  private async tokenize(organizationId: string, contactId: string) {
    const token = `[محذوف-${contactId.slice(-6)}]`;

    const messages = await prisma.message.updateMany({
      where: { organizationId, contactId },
      data: { text: token, caption: null },
    });

    const transcripts = await prisma.callTranscriptTurn.updateMany({
      where: { call: { organizationId, contactId } },
      data: { text: token, redactedText: null },
    });

    const calls = await prisma.call.updateMany({
      where: { organizationId, contactId },
      data: { summary: null, structuredSummary: undefined },
    });

    // FAQ entries learned from this person's conversations carry their words.
    const faqs = await prisma.faqEntry.deleteMany({
      where: {
        organizationId,
        sourceConversationId: { in: (await this.conversationIds(organizationId, contactId)) },
      },
    });

    await prisma.contact.updateMany({
      where: { id: contactId, organizationId },
      data: {
        name: token,
        email: null,
        notes: null,
        company: null,
        city: null,
        country: null,
        // The phone is the join key for the whole record and for the
        // do-not-contact list; replacing it would orphan both. It is replaced
        // with a stable derived value instead of a real number.
        primaryPhone: `deleted-${contactId.slice(-10)}`,
        normalizedPhone: `deleted-${contactId.slice(-10)}`,
        consentStatus: "OPTED_OUT",
        marketingOptOutAt: new Date(),
        deletedAt: new Date(),
      },
    });

    return {
      messages: messages.count,
      transcriptTurns: transcripts.count,
      calls: calls.count,
      faqEntries: faqs.count,
    };
  }

  /** Removes the rows. Destructive, and the analytics consequence is real. */
  private async purge(organizationId: string, contactId: string) {
    const conversationIds = await this.conversationIds(organizationId, contactId);

    const faqs = await prisma.faqEntry.deleteMany({
      where: { organizationId, sourceConversationId: { in: conversationIds } },
    });
    const transcripts = await prisma.callTranscriptTurn.deleteMany({
      where: { call: { organizationId, contactId } },
    });
    const messages = await prisma.message.deleteMany({ where: { organizationId, contactId } });
    const calls = await prisma.call.deleteMany({ where: { organizationId, contactId } });
    const conversations = await prisma.conversation.deleteMany({
      where: { organizationId, contactId },
    });
    await prisma.contact.deleteMany({ where: { id: contactId, organizationId } });

    return {
      messages: messages.count,
      transcriptTurns: transcripts.count,
      calls: calls.count,
      conversations: conversations.count,
      faqEntries: faqs.count,
    };
  }

  private async conversationIds(organizationId: string, contactId: string): Promise<string[]> {
    const rows = await prisma.conversation.findMany({
      where: { organizationId, contactId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
