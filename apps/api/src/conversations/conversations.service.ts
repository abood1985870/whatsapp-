import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { queues, emitToOrganization } from "@qanoai/queue";

/**
 * Every method takes `organizationId` and puts it in the `where` clause.
 *
 * Before this, a conversation was addressed by id alone — `findUnique({ where:
 * { id } })`, `update({ where: { id } })`. The guard checked that the caller
 * had `conversations.read` somewhere, then the query fetched whatever row that
 * id pointed at, in any tenant. Conversation ids are cuids and not guessable,
 * but "hard to guess" is not an access control, and ids leak through exports,
 * webhooks and support tickets.
 *
 * Writes use `updateMany`/`deleteMany` so a mismatch is a zero-row no-op rather
 * than a thrown error that confirms the row exists in someone else's account.
 */
@Injectable()
export class ConversationsService {
  /** Confirms the conversation belongs to this organization before anything else. */
  private async assertOwned(id: string, organizationId: string) {
    const conv = await prisma.conversation.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException("CONVERSATION_NOT_FOUND");
    return conv;
  }

  async findAll(organizationId: string, filters: any): Promise<any> {
    const where: any = { organizationId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.assignedToMe && filters.membershipId) where.assignedMembershipId = filters.membershipId;

    return prisma.conversation.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, primaryPhone: true, avatarUrl: true } },
        assignedMembership: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        team: { select: { id: true, name: true } },
        connection: { select: { id: true, name: true, status: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  async findOne(id: string, organizationId: string): Promise<any> {
    const conv = await prisma.conversation.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        contact: true,
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 50,
          include: { mediaAsset: true },
        },
        assignedMembership: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        team: true,
        tags: { include: { tag: true } },
        watchers: { include: { conversation: false } },
        internalNotes: {
          include: {
            membership: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    if (!conv) throw new NotFoundException("CONVERSATION_NOT_FOUND");
    return conv;
  }

  /** Shared scoped write. Returns the updated row, or throws if it was not ours. */
  private async scopedUpdate(id: string, organizationId: string, data: any): Promise<any> {
    const updated = await prisma.conversation.updateMany({
      where: { id, organizationId, deletedAt: null },
      data,
    });
    if (updated.count === 0) throw new NotFoundException("CONVERSATION_NOT_FOUND");
    return prisma.conversation.findUnique({ where: { id } });
  }

  async update(id: string, organizationId: string, data: any): Promise<any> {
    return this.scopedUpdate(id, organizationId, {
      status: data.status,
      mode: data.mode,
      priority: data.priority,
      snoozedUntil: data.snoozedUntil ? new Date(data.snoozedUntil) : undefined,
    });
  }

  async assign(id: string, organizationId: string, membershipId: string): Promise<any> {
    // The membership must belong to the same organization, or a caller could
    // assign their conversations to a stranger — or discover another tenant's
    // membership ids by which ones succeed.
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException("MEMBERSHIP_NOT_IN_ORGANIZATION");

    await this.assertOwned(id, organizationId);
    await prisma.assignmentHistory.create({ data: { conversationId: id, membershipId, assignedAt: new Date() } });
    return this.scopedUpdate(id, organizationId, { assignedMembershipId: membershipId, status: "OPEN" });
  }

  async resolve(id: string, organizationId: string): Promise<any> {
    await this.scopedUpdate(id, organizationId, { status: "RESOLVED", resolvedAt: new Date() });
    const conversation = await prisma.conversation.findFirst({
      where: { id, organizationId },
      include: { contact: true },
    });
    if (!conversation) throw new NotFoundException("CONVERSATION_NOT_FOUND");

    await queues.conversationSummary.add("summarize-on-close", {
      conversationId: id,
      organizationId: conversation.organizationId,
    });
    emitToOrganization(conversation.organizationId, "conversation:updated", {
      id: conversation.id,
      contact: {
        name: conversation.contact.name,
        primaryPhone: conversation.contact.primaryPhone,
        avatarUrl: conversation.contact.avatarUrl,
      },
      status: conversation.status,
      mode: conversation.mode,
      priority: conversation.priority,
      lastMessageAt: conversation.lastMessageAt,
    });
    return conversation;
  }

  async snooze(id: string, organizationId: string, until: Date): Promise<any> {
    return this.scopedUpdate(id, organizationId, { snoozedUntil: until, status: "SNOOZED" });
  }

  async unsnooze(id: string, organizationId: string): Promise<any> {
    return this.scopedUpdate(id, organizationId, { snoozedUntil: null, status: "OPEN" });
  }

  async reopen(id: string, organizationId: string): Promise<any> {
    return this.scopedUpdate(id, organizationId, { status: "OPEN", resolvedAt: null });
  }

  async block(id: string, organizationId: string): Promise<any> {
    return this.scopedUpdate(id, organizationId, { status: "SPAM", resolvedAt: new Date() });
  }

  async addTag(conversationId: string, organizationId: string, tagId: string): Promise<any> {
    await this.assertOwned(conversationId, organizationId);
    const tag = await prisma.tag.findFirst({ where: { id: tagId, organizationId }, select: { id: true } });
    if (!tag) throw new BadRequestException("TAG_NOT_IN_ORGANIZATION");
    return prisma.conversationTag.create({ data: { conversationId, tagId } });
  }

  async removeTag(conversationId: string, organizationId: string, tagId: string): Promise<any> {
    await this.assertOwned(conversationId, organizationId);
    await prisma.conversationTag.deleteMany({ where: { conversationId, tagId } });
    return { success: true };
  }

  async watch(conversationId: string, organizationId: string, membershipId: string): Promise<any> {
    await this.assertOwned(conversationId, organizationId);
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException("MEMBERSHIP_NOT_IN_ORGANIZATION");

    const existing = await prisma.conversationWatcher.findUnique({
      where: { conversationId_membershipId: { conversationId, membershipId } },
    });
    if (!existing) {
      await prisma.conversationWatcher.create({ data: { conversationId, membershipId } });
    }
    return { success: true };
  }

  async unwatch(conversationId: string, organizationId: string, membershipId: string): Promise<any> {
    await this.assertOwned(conversationId, organizationId);
    await prisma.conversationWatcher.deleteMany({ where: { conversationId, membershipId } });
    return { success: true };
  }

  async getHistory(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    return prisma.assignmentHistory.findMany({
      where: { conversationId: id },
      include: { membership: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { assignedAt: "desc" },
    });
  }

  async getNotes(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    return prisma.internalNote.findMany({
      where: { conversationId: id },
      include: { membership: { include: { user: { select: { name: true, avatarUrl: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async addNote(
    conversationId: string,
    organizationId: string,
    membershipId: string,
    content: string
  ): Promise<any> {
    await this.assertOwned(conversationId, organizationId);
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException("MEMBERSHIP_NOT_IN_ORGANIZATION");
    return prisma.internalNote.create({ data: { conversationId, membershipId, content } });
  }

  async merge(sourceId: string, organizationId: string, targetId: string): Promise<any> {
    if (sourceId === targetId) throw new BadRequestException("CANNOT_MERGE_WITH_SELF");
    // BOTH ends must be ours. Merging into another tenant's conversation would
    // otherwise write an event row into their account.
    await this.assertOwned(sourceId, organizationId);
    await this.assertOwned(targetId, organizationId);

    await this.scopedUpdate(sourceId, organizationId, { status: "RESOLVED", resolvedAt: new Date() });
    await prisma.conversationEvent.create({
      data: {
        conversationId: sourceId,
        eventType: "MERGED",
        metadata: { targetConversationId: targetId },
      },
    });
    await prisma.conversationEvent.create({
      data: {
        conversationId: targetId,
        eventType: "MERGED_FROM",
        metadata: { sourceConversationId: sourceId },
      },
    });

    return { success: true, targetConversationId: targetId };
  }

  async bulkAction(
    organizationId: string,
    conversationIds: string[],
    action: string,
    payload?: any
  ): Promise<any> {
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      throw new BadRequestException("NO_CONVERSATIONS");
    }
    // Bounded so one request cannot rewrite an entire table.
    if (conversationIds.length > 500) throw new BadRequestException("TOO_MANY_CONVERSATIONS");

    // Re-resolve the ids against this organization first. The updateMany calls
    // below are scoped anyway, but assignmentHistory/conversationTag createMany
    // are NOT — they used the caller's raw id list, so ids from another tenant
    // would have had history and tag rows written against them.
    const owned = await prisma.conversation.findMany({
      where: { id: { in: conversationIds }, organizationId, deletedAt: null },
      select: { id: true },
    });
    const ownedIds = owned.map((c) => c.id);
    if (ownedIds.length === 0) return { success: true, updatedCount: 0 };

    const whereClause = { id: { in: ownedIds }, organizationId };

    switch (action) {
      case "ASSIGN": {
        if (!payload?.membershipId) throw new BadRequestException("MISSING_MEMBERSHIP");
        const membership = await prisma.membership.findFirst({
          where: { id: payload.membershipId, organizationId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!membership) throw new BadRequestException("MEMBERSHIP_NOT_IN_ORGANIZATION");
        await prisma.conversation.updateMany({
          where: whereClause,
          data: { assignedMembershipId: payload.membershipId, status: "OPEN" },
        });
        await prisma.assignmentHistory.createMany({
          data: ownedIds.map((id) => ({
            conversationId: id,
            membershipId: payload.membershipId,
            assignedAt: new Date(),
          })),
        });
        break;
      }
      case "CLOSE":
        await prisma.conversation.updateMany({
          where: whereClause,
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
        break;
      case "SNOOZE":
        if (!payload?.until) throw new BadRequestException("MISSING_UNTIL");
        await prisma.conversation.updateMany({
          where: whereClause,
          data: { status: "SNOOZED", snoozedUntil: new Date(payload.until) },
        });
        break;
      case "ADD_TAG": {
        if (!payload?.tagId) throw new BadRequestException("MISSING_TAG");
        const tag = await prisma.tag.findFirst({
          where: { id: payload.tagId, organizationId },
          select: { id: true },
        });
        if (!tag) throw new BadRequestException("TAG_NOT_IN_ORGANIZATION");
        const existingTags = await prisma.conversationTag.findMany({
          where: { conversationId: { in: ownedIds }, tagId: payload.tagId },
        });
        const existingIds = new Set(existingTags.map((t: any) => t.conversationId));
        const newTags = ownedIds
          .filter((id) => !existingIds.has(id))
          .map((id) => ({ conversationId: id, tagId: payload.tagId }));
        if (newTags.length > 0) await prisma.conversationTag.createMany({ data: newTags });
        break;
      }
      default:
        throw new BadRequestException("INVALID_ACTION");
    }
    return { success: true, updatedCount: ownedIds.length };
  }

  async exportToCsv(organizationId: string): Promise<string> {
    const conversations = await prisma.conversation.findMany({
      where: { organizationId, deletedAt: null },
      include: { contact: true, assignedMembership: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    });

    // Values are quoted and internal quotes doubled — a contact named
    // `شركة "الرواد"` used to break the column alignment of the whole file.
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    let csv = "ID,Status,Mode,Priority,Contact Name,Contact Phone,Assigned To,Created At,Last Message At\n";
    for (const c of conversations) {
      csv +=
        [
          cell(c.id),
          cell(c.status),
          cell(c.mode),
          cell(c.priority),
          cell(c.contact.name),
          cell(c.contact.primaryPhone),
          cell(c.assignedMembership?.user?.name || "Unassigned"),
          cell(c.createdAt.toISOString()),
          cell(c.lastMessageAt?.toISOString() || ""),
        ].join(",") + "\n";
    }
    return csv;
  }
}
