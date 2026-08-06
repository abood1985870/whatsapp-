import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { queues, emitToOrganization } from "@qanoai/queue";

@Injectable()
export class ConversationsService {
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
        tags: { include: { tag: true } }
      },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  async findOne(id: string): Promise<any> {
    const conv = await prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        messages: {
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

  async update(id: string, data: any): Promise<any> {
    return prisma.conversation.update({ 
      where: { id }, 
      data: { status: data.status, mode: data.mode, priority: data.priority, snoozedUntil: data.snoozedUntil ? new Date(data.snoozedUntil) : undefined } 
    });
  }

  async assign(id: string, membershipId: string): Promise<any> {
    await prisma.assignmentHistory.create({ data: { conversationId: id, membershipId, assignedAt: new Date() } });
    return prisma.conversation.update({ where: { id }, data: { assignedMembershipId: membershipId, status: "OPEN" } });
  }

  async resolve(id: string): Promise<any> {
    const conversation = await prisma.conversation.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() }, include: { contact: true } });
    await queues.conversationSummary.add("summarize-on-close", { conversationId: id, organizationId: conversation.organizationId });
    emitToOrganization(conversation.organizationId, "conversation:updated", {
      id: conversation.id,
      contact: { name: conversation.contact.name, primaryPhone: conversation.contact.primaryPhone, avatarUrl: conversation.contact.avatarUrl },
      status: conversation.status,
      mode: conversation.mode,
      priority: conversation.priority,
      lastMessageAt: conversation.lastMessageAt
    });
    return conversation;
  }

  async snooze(id: string, until: Date): Promise<any> {
    return prisma.conversation.update({ where: { id }, data: { snoozedUntil: until, status: "SNOOZED" } });
  }

  async unsnooze(id: string): Promise<any> {
    return prisma.conversation.update({ where: { id }, data: { snoozedUntil: null, status: "OPEN" } });
  }

  async reopen(id: string): Promise<any> {
    return prisma.conversation.update({ where: { id }, data: { status: "OPEN", resolvedAt: null } });
  }

  async block(id: string): Promise<any> {
    return prisma.conversation.update({ where: { id }, data: { status: "SPAM", resolvedAt: new Date() } });
  }

  async addTag(conversationId: string, tagId: string): Promise<any> {
    return prisma.conversationTag.create({ data: { conversationId, tagId } });
  }

  async removeTag(conversationId: string, tagId: string): Promise<any> {
    await prisma.conversationTag.deleteMany({ where: { conversationId, tagId } });
    return { success: true };
  }

  async watch(conversationId: string, membershipId: string): Promise<any> {
    const existing = await prisma.conversationWatcher.findUnique({ where: { conversationId_membershipId: { conversationId, membershipId } } });
    if (!existing) {
      await prisma.conversationWatcher.create({ data: { conversationId, membershipId } });
    }
    return { success: true };
  }

  async unwatch(conversationId: string, membershipId: string): Promise<any> {
    await prisma.conversationWatcher.deleteMany({ where: { conversationId, membershipId } });
    return { success: true };
  }

  async getHistory(id: string): Promise<any> {
    return prisma.assignmentHistory.findMany({ 
      where: { conversationId: id },
      include: { membership: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { assignedAt: "desc" }
    });
  }

  async getNotes(id: string): Promise<any> {
    return prisma.internalNote.findMany({ 
      where: { conversationId: id },
      include: { membership: { include: { user: { select: { name: true, avatarUrl: true } } } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async addNote(conversationId: string, membershipId: string, content: string): Promise<any> {
    return prisma.internalNote.create({
      data: { conversationId, membershipId, content }
    });
  }

  async merge(sourceId: string, targetId: string): Promise<any> {
    if (sourceId === targetId) throw new BadRequestException("CANNOT_MERGE_WITH_SELF");
    const source = await prisma.conversation.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException("SOURCE_NOT_FOUND");
    
    // Close source and add an event
    await prisma.conversation.update({ where: { id: sourceId }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    await prisma.conversationEvent.create({
      data: {
        conversationId: sourceId,
        eventType: "MERGED",
        metadata: { targetConversationId: targetId }
      }
    });
    
    await prisma.conversationEvent.create({
      data: {
        conversationId: targetId,
        eventType: "MERGED_FROM",
        metadata: { sourceConversationId: sourceId }
      }
    });

    return { success: true, targetConversationId: targetId };
  }

  async bulkAction(organizationId: string, conversationIds: string[], action: string, payload?: any): Promise<any> {
    const whereClause = { id: { in: conversationIds }, organizationId };
    
    switch (action) {
      case "ASSIGN":
        if (!payload?.membershipId) throw new BadRequestException("MISSING_MEMBERSHIP");
        await prisma.conversation.updateMany({ where: whereClause, data: { assignedMembershipId: payload.membershipId, status: "OPEN" } });
        // Add history for all
        await prisma.assignmentHistory.createMany({
          data: conversationIds.map(id => ({ conversationId: id, membershipId: payload.membershipId, assignedAt: new Date() }))
        });
        break;
      case "CLOSE":
        await prisma.conversation.updateMany({ where: whereClause, data: { status: "RESOLVED", resolvedAt: new Date() } });
        break;
      case "SNOOZE":
        if (!payload?.until) throw new BadRequestException("MISSING_UNTIL");
        await prisma.conversation.updateMany({ where: whereClause, data: { status: "SNOOZED", snoozedUntil: new Date(payload.until) } });
        break;
      case "ADD_TAG":
        if (!payload?.tagId) throw new BadRequestException("MISSING_TAG");
        const existingTags = await prisma.conversationTag.findMany({ where: { conversationId: { in: conversationIds }, tagId: payload.tagId } });
        const existingIds = new Set(existingTags.map((t: any) => t.conversationId));
        const newTags = conversationIds.filter(id => !existingIds.has(id)).map(id => ({ conversationId: id, tagId: payload.tagId }));
        if (newTags.length > 0) await prisma.conversationTag.createMany({ data: newTags });
        break;
      default:
        throw new BadRequestException("INVALID_ACTION");
    }
    return { success: true, updatedCount: conversationIds.length };
  }

  async exportToCsv(organizationId: string): Promise<string> {
    const conversations = await prisma.conversation.findMany({
      where: { organizationId },
      include: { contact: true, assignedMembership: { include: { user: true } } },
      orderBy: { createdAt: "desc" }
    });

    let csv = "ID,Status,Mode,Priority,Contact Name,Contact Phone,Assigned To,Created At,Last Message At\n";
    for (const c of conversations) {
      const assignedTo = c.assignedMembership?.user?.name || "Unassigned";
      const contactName = c.contact.name || "";
      const contactPhone = c.contact.primaryPhone || "";
      csv += `${c.id},${c.status},${c.mode},${c.priority},"${contactName}","${contactPhone}","${assignedTo}",${c.createdAt.toISOString()},${c.lastMessageAt?.toISOString() || ""}\n`;
    }
    return csv;
  }
}
