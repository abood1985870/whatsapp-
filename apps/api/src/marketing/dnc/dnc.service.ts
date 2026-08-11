import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, normalizePhoneStrict } from "@qanoai/shared";
import { dncAddSchema } from "@qanoai/validation";
import { AuditService } from "../../audit/audit.service";

// Deterministic Arabic/English opt-out markers. Kept intentionally broad:
// when in doubt we stop marketing.
const OPT_OUT_PATTERNS: RegExp[] = [
  /لا\s*ترسل/,
  /وقف\s*الرسائل/,
  /أوقف(?:وا)?\s*الرسائل/,
  /اوقف(?:وا)?\s*الرسائل/,
  /لا\s*تتواصل/,
  /احذف(?:وا)?\s*رقمي/,
  /غير\s*مهتم.*(لا\s*ترسل|توقف)/,
  /ما\s*أبي\s*رسائل/,
  /بلاغ|ازعاج|إزعاج/,
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bremove\s+me\b/i,
];

@Injectable()
export class DncService {
  constructor(private readonly audit: AuditService) {}

  async list(organizationId: string, page = 1, limit = 50) {
    const skip = (Math.max(page, 1) - 1) * limit;
    const where = { organizationId, isActive: true };
    const [items, total] = await Promise.all([
      prisma.dncEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.dncEntry.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Server-side gate consulted immediately before every marketing send. */
  async isBlocked(organizationId: string, phoneRaw: string): Promise<boolean> {
    const { normalized } = normalizePhoneStrict(phoneRaw);
    if (!normalized) return true; // unparseable numbers are never marketed to
    const entry = await prisma.dncEntry.findUnique({
      where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
    });
    return entry?.isActive === true;
  }

  async add(dto: unknown, actorUserId: string | null, source = "MANUAL") {
    const parsed = dncAddSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.addNormalized(
      parsed.data.organizationId,
      parsed.data.phone,
      parsed.data.reason ?? null,
      actorUserId,
      source,
      parsed.data.note ?? null
    );
  }

  async addNormalized(
    organizationId: string,
    phoneRaw: string,
    reason: string | null,
    actorUserId: string | null,
    source: string,
    note: string | null = null
  ) {
    const { normalized, valid } = normalizePhoneStrict(phoneRaw);
    if (!normalized || !valid) throw new BadRequestException("INVALID_PHONE");

    const entry = await prisma.dncEntry.upsert({
      where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
      update: { isActive: true, reason: reason ?? undefined, source, note: note ?? undefined, removedAt: null, removedById: null },
      create: { organizationId, normalizedPhone: normalized, reason, source, note, addedById: actorUserId },
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorUserId ?? undefined,
      action: "MARKETING_DNC_ADDED",
      resourceType: "DncEntry",
      resourceId: entry.id,
      metadata: { source, reason },
      correlationId: generateCorrelationId(),
    });

    // Stop any queued marketing to this number and freeze the lead.
    const leads = await prisma.lead.findMany({
      where: { organizationId, normalizedPhone: normalized },
      select: { id: true, status: true },
    });
    for (const lead of leads) {
      if (lead.status !== "DO_NOT_CONTACT") {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "DO_NOT_CONTACT" } });
        await prisma.leadStateTransition.create({
          data: { leadId: lead.id, fromStatus: lead.status, toStatus: "DO_NOT_CONTACT", reason: reason ?? source, source: "DNC" },
        });
      }
      await prisma.campaignRecipient.updateMany({
        where: { leadId: lead.id, status: { in: ["PENDING", "READY", "QUEUED"] } },
        data: { status: "SKIPPED_DNC" },
      });
    }

    return entry;
  }

  /** Privileged, audited removal. */
  async remove(organizationId: string, id: string, actorUserId: string) {
    const entry = await prisma.dncEntry.findFirst({ where: { id, organizationId } });
    if (!entry) throw new BadRequestException("DNC_ENTRY_NOT_FOUND");

    const updated = await prisma.dncEntry.update({
      where: { id: entry.id },
      data: { isActive: false, removedAt: new Date(), removedById: actorUserId },
    });

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "MARKETING_DNC_REMOVED",
      resourceType: "DncEntry",
      resourceId: entry.id,
      beforeData: { normalizedPhone: entry.normalizedPhone },
      correlationId: generateCorrelationId(),
    });

    return updated;
  }

  /** Deterministic opt-out detection for inbound messages. */
  detectOptOutIntent(text: string): boolean {
    const trimmed = (text || "").trim();
    if (!trimmed) return false;
    return OPT_OUT_PATTERNS.some((p) => p.test(trimmed));
  }
}
