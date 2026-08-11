import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class VoiceCallsService {
  constructor(private readonly audit: AuditService) {}

  async list(
    organizationId: string,
    opts: { status?: string; outcome?: string; search?: string; page?: number; limit?: number }
  ) {
    const page = Math.max(opts.page ?? 1, 1);
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const where: any = { organizationId };
    if (opts.status) where.status = opts.status;
    if (opts.outcome) where.salesOutcome = opts.outcome;
    if (opts.search) {
      const digits = opts.search.replace(/\D/g, "");
      where.OR = [
        { fromNumber: { contains: opts.search } },
        ...(digits ? [{ normalizedFromPhone: { contains: digits } }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      prisma.call.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { agent: { select: { name: true, employeeName: true } } },
      }),
      prisma.call.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async detail(organizationId: string, id: string) {
    const call = await prisma.call.findFirst({
      where: { id, organizationId },
      include: { agent: { select: { name: true, employeeName: true, role: true } } },
    });
    if (!call) throw new NotFoundException("CALL_NOT_FOUND");

    const [transcript, events, toolExecutions, product, lead] = await Promise.all([
      prisma.callTranscriptTurn.findMany({ where: { callId: id }, orderBy: { turnIndex: "asc" } }),
      prisma.callEvent.findMany({ where: { callId: id }, orderBy: { createdAt: "asc" }, take: 200 }),
      prisma.callToolExecution.findMany({ where: { callId: id }, orderBy: { createdAt: "asc" } }),
      call.productId
        ? prisma.salesProduct.findUnique({ where: { id: call.productId }, select: { nameArabic: true, priceMinor: true } })
        : null,
      call.leadId
        ? prisma.lead.findUnique({ where: { id: call.leadId }, select: { businessName: true, status: true } })
        : null,
    ]);

    return {
      call,
      product,
      lead,
      // Redacted text wins wherever PII was detected.
      transcript: transcript.map((t) => ({
        turnIndex: t.turnIndex,
        speaker: t.speaker,
        text: t.containsPii && t.redactedText ? t.redactedText : t.text,
        containsPii: t.containsPii,
        startOffsetMs: t.startOffsetMs,
      })),
      events,
      toolExecutions: toolExecutions.map((e) => ({
        toolId: e.toolId,
        status: e.status,
        denyReason: e.denyReason,
        errorMessage: e.errorMessage,
        durationMs: e.durationMs,
        createdAt: e.createdAt,
      })),
    };
  }

  /**
   * Recording access is a sensitive read: permission-checked upstream,
   * audited here, and refused outright while object storage is a stub so
   * we never hand out a URL that does not resolve.
   */
  async requestRecordingAccess(organizationId: string, callId: string, actorUserId: string) {
    const call = await prisma.call.findFirst({ where: { id: callId, organizationId } });
    if (!call) throw new NotFoundException("CALL_NOT_FOUND");

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_RECORDING_ACCESS_REQUESTED",
      resourceType: "Call",
      resourceId: callId,
      correlationId: call.correlationId,
    });

    if (!call.recordingStorageKey) {
      return { available: false, reason: "NO_RECORDING", note: "التسجيل غير مفعّل أو غير متاح لهذه المكالمة." };
    }
    return {
      available: false,
      reason: "STORAGE_NOT_CONFIGURED",
      note: "تخزين الملفات غير مهيأ بعد، فلا يمكن إصدار رابط تحميل آمن. راجع دليل الإعداد الخارجي.",
    };
  }

  /** Analytics from real rows only; nothing is inferred or invented. */
  async analytics(organizationId: string) {
    const [total, byStatus, byOutcome, durationAgg, supportCount, usageAgg, failureEvents] = await Promise.all([
      prisma.call.count({ where: { organizationId } }),
      prisma.call.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
      prisma.call.groupBy({ by: ["salesOutcome"], where: { organizationId, salesOutcome: { not: null } }, _count: { _all: true } }),
      prisma.call.aggregate({
        where: { organizationId, durationSeconds: { gt: 0 } },
        _avg: { durationSeconds: true },
        _sum: { durationSeconds: true, estimatedCostMinor: true },
      }),
      prisma.call.count({ where: { organizationId, supportRequired: true } }),
      prisma.voiceUsageRecord.aggregate({
        where: { organizationId },
        _sum: { estimatedCostMinor: true, actualCostMinor: true, followupCount: true, toolCallCount: true },
      }),
      prisma.callEvent.count({ where: { call: { organizationId }, eventType: "FAILSAFE_TRIGGERED" } }),
    ]);

    const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    const answered = await prisma.call.count({ where: { organizationId, answeredAt: { not: null } } });

    return {
      totals: {
        calls: total,
        answered,
        failed: (statusCounts.FAILED ?? 0) + (statusCounts.DISCONNECTED ?? 0),
        supportRequests: supportCount,
        failsafeTriggers: failureEvents,
      },
      byStatus: statusCounts,
      byOutcome: Object.fromEntries(byOutcome.map((o) => [o.salesOutcome ?? "UNKNOWN", o._count._all])),
      duration: {
        averageSeconds: Math.round(durationAgg._avg.durationSeconds ?? 0),
        totalSeconds: durationAgg._sum.durationSeconds ?? 0,
      },
      cost: {
        estimatedMinor: usageAgg._sum.estimatedCostMinor ?? 0,
        // Null means the provider never reported a real figure — shown as unavailable.
        actualMinor: usageAgg._sum.actualCostMinor,
        actualAvailable: usageAgg._sum.actualCostMinor !== null,
        note: usageAgg._sum.actualCostMinor === null ? "غير متاح من مزود الاتصال الحالي" : undefined,
      },
      activity: {
        toolCalls: usageAgg._sum.toolCallCount ?? 0,
        whatsappFollowups: usageAgg._sum.followupCount ?? 0,
      },
    };
  }
}
