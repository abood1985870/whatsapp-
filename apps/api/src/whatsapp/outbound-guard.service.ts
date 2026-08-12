import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { normalizePhoneStrict } from "@qanoai/shared";

/**
 * The single gate every outbound WhatsApp message passes through.
 *
 * There were sixteen places in this codebase that sent a message, and five of
 * them consulted nothing at all — not the do-not-contact list, not the opt-out
 * a customer had already sent, not the organization's own kill switch, which
 * existed as a database column that nothing read. A customer who replied
 * "أوقفوا الرسائل" could still be messaged by four different code paths.
 *
 * The point of this class is that the rules live in ONE place, so a new send
 * path cannot quietly skip them.
 *
 * WHAT IS DELIBERATELY *NOT* BLOCKED:
 * Replying to a customer who has just written to us. Quiet hours and frequency
 * caps exist to stop unsolicited marketing at 2am, not to stop an agent
 * answering a question at 2am. Applying them to support replies would break the
 * product in the name of protecting it.
 */
export type OutboundKind =
  /** Campaign or first-touch sales message. Every rule applies. */
  | "MARKETING"
  /** The AI answering inside a conversation the customer started. */
  | "AI_REPLY"
  /** A person clicking send in the inbox. The escape hatch — the kill switch does not stop this. */
  | "HUMAN_REPLY"
  /** Alerts to the tenant's own staff (hot-lead pings, support escalations). */
  | "SYSTEM_NOTICE";

export interface OutboundRequest {
  organizationId: string;
  /** Raw phone; normalised here so callers cannot skip it. */
  toPhone: string;
  kind: OutboundKind;
  contactId?: string;
  conversationId?: string;
}

export interface OutboundDecision {
  allowed: boolean;
  /** Machine-readable, and written to the message row when a send is refused. */
  reason?: string;
  detail?: string;
}

const ALLOW: OutboundDecision = { allowed: true };

/** Riyadh is UTC+3 year-round. No DST, so a fixed offset is correct rather than lazy. */
const RIYADH_OFFSET_HOURS = 3;

@Injectable()
export class OutboundGuardService {
  private readonly logger = new Logger(OutboundGuardService.name);

  async check(request: OutboundRequest): Promise<OutboundDecision> {
    const { organizationId, kind } = request;

    const { normalized } = normalizePhoneStrict(request.toPhone);
    if (!normalized) {
      return { allowed: false, reason: "UNPARSEABLE_PHONE" };
    }

    const settings = await prisma.marketingSettings.findUnique({ where: { organizationId } });

    // 1. Kill switch — the emergency stop.
    //
    // The column existed and nothing read it. Turning it on did nothing at all,
    // which is worse than not having it: an operator watching a campaign go
    // wrong flips the switch and believes the sending has stopped.
    if (settings?.killSwitchEnabled && kind !== "HUMAN_REPLY") {
      return { allowed: false, reason: "KILL_SWITCH_ENABLED" };
    }

    // 2. Do-not-contact and opt-out.
    //
    // Applies to anything we initiate. A customer who asked us to stop has
    // asked about marketing and alerts, not about the answer to the question
    // they are asking right now.
    if (kind === "MARKETING" || kind === "SYSTEM_NOTICE") {
      const dnc = await prisma.dncEntry.findUnique({
        where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
      });
      if (dnc?.isActive) {
        return { allowed: false, reason: "DO_NOT_CONTACT" };
      }
    }

    if (kind !== "MARKETING") return ALLOW;

    // ── Marketing-only limits ────────────────────────────────────────────
    const now = new Date();

    // 3. Per-organization daily ceiling. One misconfigured campaign should not
    //    be able to message an entire imported list in an afternoon.
    const cap = settings?.dailyOutboundCap ?? 1000;
    if (cap > 0) {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sentToday = await prisma.message.count({
        where: {
          organizationId,
          direction: "OUTBOUND",
          isMarketing: true,
          createdAt: { gte: since },
        },
      });
      if (sentToday >= cap) {
        return { allowed: false, reason: "DAILY_CAP_REACHED", detail: `${sentToday}/${cap}` };
      }
    }

    // 4. Per-contact frequency. Being messaged twice in one morning by the same
    //    company is how a number ends up reported.
    const minIntervalHours = settings?.perContactMinIntervalHours ?? 20;
    if (minIntervalHours > 0 && request.contactId) {
      const since = new Date(now.getTime() - minIntervalHours * 60 * 60 * 1000);
      const recent = await prisma.message.findFirst({
        where: {
          organizationId,
          contactId: request.contactId,
          direction: "OUTBOUND",
          isMarketing: true,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (recent) {
        return { allowed: false, reason: "CONTACT_FREQUENCY_CAP", detail: `${minIntervalHours}h` };
      }
    }

    // 5. Quiet hours, in the customer's timezone rather than the server's.
    if (settings?.quietHoursEnabled !== false) {
      const start = settings?.quietHoursStart ?? 22;
      const end = settings?.quietHoursEnd ?? 8;
      const riyadhHour = (now.getUTCHours() + RIYADH_OFFSET_HOURS) % 24;
      // The window wraps past midnight, so it is a union rather than a range.
      const inQuietHours = start > end ? riyadhHour >= start || riyadhHour < end : riyadhHour >= start && riyadhHour < end;
      if (inQuietHours) {
        return { allowed: false, reason: "QUIET_HOURS", detail: `${start}:00-${end}:00 Asia/Riyadh` };
      }
    }

    return ALLOW;
  }

  /** Convenience for callers that only need a boolean and a log line. */
  async allow(request: OutboundRequest): Promise<boolean> {
    const decision = await this.check(request);
    if (!decision.allowed) {
      this.logger.warn(
        `Outbound ${request.kind} blocked for org ${request.organizationId}: ${decision.reason}` +
          (decision.detail ? ` (${decision.detail})` : "")
      );
    }
    return decision.allowed;
  }
}
