import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { normalizePhone } from "@qanoai/shared";

@Injectable()
export class ContactsService {
  async findAll(organizationId: string, search?: string): Promise<any> {
    const where: any = { organizationId, deletedAt: null };
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { primaryPhone: { contains: search } }, { email: { contains: search, mode: "insensitive" } }];
    return prisma.contact.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 100 });
  }

  async findOne(id: string): Promise<any> {
    const contact = await prisma.contact.findUnique({ 
      where: { id }, 
      include: { 
        conversations: { orderBy: { createdAt: "desc" }, take: 10 }, 
        tags: { include: { tag: true } }, 
        customFields: { include: { definition: true } } 
      } 
    });
    if (!contact) throw new NotFoundException("CONTACT_NOT_FOUND");
    return contact;
  }

  async create(data: any): Promise<any> {
    const normalized = normalizePhone(data.primaryPhone);
    const existing = await prisma.contact.findUnique({ where: { organizationId_normalizedPhone: { organizationId: data.organizationId, normalizedPhone: normalized } } });
    if (existing) throw new ConflictException("CONTACT_ALREADY_EXISTS");
    return prisma.contact.create({ data: { organizationId: data.organizationId, primaryPhone: data.primaryPhone, normalizedPhone: normalized, name: data.name, email: data.email, language: data.language, company: data.company, country: data.country, city: data.city, notes: data.notes } });
  }

  async update(id: string, data: any): Promise<any> { 
    return prisma.contact.update({ where: { id }, data: { name: data.name, email: data.email, language: data.language, company: data.company, country: data.country, city: data.city, notes: data.notes } }); 
  }

  async addTag(contactId: string, tagId: string): Promise<any> {
    return prisma.contactTag.create({ data: { contactId, tagId } });
  }

  async removeTag(contactId: string, tagId: string): Promise<any> {
    await prisma.contactTag.deleteMany({ where: { contactId, tagId } });
    return { success: true };
  }

  async setCustomField(contactId: string, definitionId: string, value: string): Promise<any> {
    const existing = await prisma.contactCustomFieldValue.findUnique({ where: { contactId_definitionId: { contactId, definitionId } } });
    if (existing) {
      return prisma.contactCustomFieldValue.update({ where: { id: existing.id }, data: { value } });
    }
    return prisma.contactCustomFieldValue.create({ data: { contactId, definitionId, value } });
  }

  async exportContacts(organizationId: string): Promise<any> {
    const contacts = await prisma.contact.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
    let csv = "ID,Name,Phone,Email,Company,Language,City,Country,Created At\n";
    for (const c of contacts) {
      csv += `${c.id},"${c.name || ''}","${c.primaryPhone}","${c.email || ''}","${c.company || ''}","${c.language || ''}","${c.city || ''}","${c.country || ''}",${c.createdAt.toISOString()}\n`;
    }
    return csv;
  }

  async importContacts(organizationId: string, csvData: string): Promise<any> {
    const lines = csvData.split('\n');
    let imported = 0;
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const [name, phone, email, company] = lines[i].split(',').map(s => s.replace(/"/g, '').trim());
      
      if (!phone) continue;
      
      const normalized = normalizePhone(phone);
      
      try {
        await prisma.contact.upsert({
          where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
          update: { name: name || undefined, email: email || undefined, company: company || undefined },
          create: { organizationId, primaryPhone: phone, normalizedPhone: normalized, name, email, company }
        });
        imported++;
      } catch (e) {
        // Skip on error
      }
    }
    return { success: true, imported };
  }

  async merge(sourceId: string, targetId: string): Promise<any> {
    if (sourceId === targetId) throw new BadRequestException("CANNOT_MERGE_WITH_SELF");
    
    // Move conversations
    await prisma.conversation.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } });
    // Move messages
    await prisma.message.updateMany({ where: { contactId: sourceId }, data: { contactId: targetId } });
    
    // Soft delete source
    await prisma.contact.update({ where: { id: sourceId }, data: { deletedAt: new Date(), notes: `Merged into ${targetId}` } });
    
    return { success: true, targetId };
  }

  async getTimeline(contactId: string): Promise<any> {
    const [conversations, messages] = await Promise.all([
      prisma.conversation.findMany({ where: { contactId }, select: { id: true, status: true, createdAt: true } }),
      prisma.message.findMany({ where: { contactId }, select: { id: true, messageType: true, text: true, direction: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } })
    ]);
    
    const timeline = [
      ...conversations.map((c: any) => ({ type: "CONVERSATION", date: c.createdAt, data: c })),
      ...messages.map((m: any) => ({ type: "MESSAGE", date: m.createdAt, data: m }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return timeline;
  }
}
