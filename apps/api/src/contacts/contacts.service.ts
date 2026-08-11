import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { normalizePhone, csvRow } from "@qanoai/shared";

/** A pasted CSV is not a bulk-migration tool; the file-upload path has its own limits. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

@Injectable()
export class ContactsService {
  /**
   * Contacts are the tenant's customer list — names, phone numbers, notes.
   *
   * Every method now takes the organization from the caller's verified
   * membership and puts it in the `where`. Addressing a contact by id alone,
   * as this service used to, meant `GET /contacts/:id` returned any tenant's
   * customer record, and `merge` could move one tenant's entire conversation
   * history onto a contact in another tenant's account.
   */
  private async assertOwned(id: string, organizationId: string) {
    const contact = await prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException("CONTACT_NOT_FOUND");
    return contact;
  }

  async findAll(organizationId: string, search?: string): Promise<any> {
    const where: any = { organizationId, deletedAt: null };
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { primaryPhone: { contains: search } }, { email: { contains: search, mode: "insensitive" } }];
    return prisma.contact.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 100 });
  }

  async findOne(id: string, organizationId: string): Promise<any> {
    const contact = await prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
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

  async update(id: string, organizationId: string, data: any): Promise<any> {
    const updated = await prisma.contact.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { name: data.name, email: data.email, language: data.language, company: data.company, country: data.country, city: data.city, notes: data.notes },
    });
    if (updated.count === 0) throw new NotFoundException("CONTACT_NOT_FOUND");
    return prisma.contact.findUnique({ where: { id } });
  }

  async addTag(contactId: string, organizationId: string, tagId: string): Promise<any> {
    await this.assertOwned(contactId, organizationId);
    const tag = await prisma.tag.findFirst({ where: { id: tagId, organizationId }, select: { id: true } });
    if (!tag) throw new BadRequestException("TAG_NOT_IN_ORGANIZATION");
    return prisma.contactTag.create({ data: { contactId, tagId } });
  }

  async removeTag(contactId: string, organizationId: string, tagId: string): Promise<any> {
    await this.assertOwned(contactId, organizationId);
    await prisma.contactTag.deleteMany({ where: { contactId, tagId } });
    return { success: true };
  }

  async setCustomField(contactId: string, organizationId: string, definitionId: string, value: string): Promise<any> {
    await this.assertOwned(contactId, organizationId);
    const definition = await prisma.contactCustomFieldDefinition.findFirst({
      where: { id: definitionId, organizationId },
      select: { id: true },
    });
    if (!definition) throw new BadRequestException("FIELD_NOT_IN_ORGANIZATION");

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
    // Every cell through the shared escaper: a company name containing a comma
    // or a quote used to shift every column after it.
    let csv = csvRow(["ID", "Name", "Phone", "Email", "Company", "Language", "City", "Country", "Created At"]) + "\n";
    for (const c of contacts) {
      csv += csvRow([c.id, c.name, c.primaryPhone, c.email, c.company, c.language, c.city, c.country, c.createdAt]) + "\n";
    }
    return csv;
  }

  async importContacts(organizationId: string, csvData: string): Promise<any> {
    if (typeof csvData !== "string" || !csvData.trim()) throw new BadRequestException("CSV_REQUIRED");
    if (csvData.length > MAX_IMPORT_BYTES) throw new BadRequestException("CSV_TOO_LARGE");

    const lines = csvData.split("\n");
    if (lines.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`TOO_MANY_ROWS: الحد الأقصى ${MAX_IMPORT_ROWS} صف`);
    }

    let imported = 0;
    let skipped = 0;
    // Errors were swallowed by a bare `catch {}`, so an import that failed on
    // every single row still reported success. The caller now gets counts and
    // the first few reasons — the difference between "it worked" and "none of
    // your 800 contacts were added, and here is why".
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const [name, phone, email, company] = lines[i].split(",").map((s) => s.replace(/"/g, "").trim());

      if (!phone) {
        skipped++;
        if (errors.length < 10) errors.push(`صف ${i + 1}: بدون رقم`);
        continue;
      }

      const normalized = normalizePhone(phone);
      if (!normalized) {
        skipped++;
        if (errors.length < 10) errors.push(`صف ${i + 1}: رقم غير صالح`);
        continue;
      }

      try {
        await prisma.contact.upsert({
          where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
          update: { name: name || undefined, email: email || undefined, company: company || undefined },
          create: { organizationId, primaryPhone: phone, normalizedPhone: normalized, name, email, company },
        });
        imported++;
      } catch (e: any) {
        skipped++;
        if (errors.length < 10) errors.push(`صف ${i + 1}: ${String(e?.message ?? "").slice(0, 120)}`);
      }
    }
    return { success: true, imported, skipped, errors };
  }

  /**
   * The most destructive operation in this file: it re-points every
   * conversation and message from one contact to another and soft-deletes the
   * source. Unscoped, it could move one organization's whole history onto a
   * contact in another organization — visible to them, gone from the owner.
   * Both ends are proven to belong to the caller, and the moves themselves
   * carry organizationId so a mismatch moves nothing.
   */
  async merge(sourceId: string, organizationId: string, targetId: string): Promise<any> {
    if (sourceId === targetId) throw new BadRequestException("CANNOT_MERGE_WITH_SELF");
    await this.assertOwned(sourceId, organizationId);
    await this.assertOwned(targetId, organizationId);

    await prisma.conversation.updateMany({ where: { contactId: sourceId, organizationId }, data: { contactId: targetId } });
    await prisma.message.updateMany({ where: { contactId: sourceId, organizationId }, data: { contactId: targetId } });

    await prisma.contact.updateMany({
      where: { id: sourceId, organizationId },
      data: { deletedAt: new Date(), notes: `Merged into ${targetId}` },
    });

    return { success: true, targetId };
  }

  async getTimeline(contactId: string, organizationId: string): Promise<any> {
    await this.assertOwned(contactId, organizationId);
    const [conversations, messages] = await Promise.all([
      prisma.conversation.findMany({ where: { contactId, organizationId, deletedAt: null }, select: { id: true, status: true, createdAt: true } }),
      prisma.message.findMany({ where: { contactId, organizationId, deletedAt: null }, select: { id: true, messageType: true, text: true, direction: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } })
    ]);
    
    const timeline = [
      ...conversations.map((c: any) => ({ type: "CONVERSATION", date: c.createdAt, data: c })),
      ...messages.map((m: any) => ({ type: "MESSAGE", date: m.createdAt, data: m }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return timeline;
  }
}
