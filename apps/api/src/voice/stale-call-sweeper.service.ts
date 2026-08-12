import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { prisma } from "@qanoai/database";

/**
 * Closes calls that stopped without telling us.
 *
 * A Call row moves to a terminal state when the provider reports the hangup. If
 * that report never arrives — the websocket drops, the container restarts
 * mid-call, Twilio's callback fails — the row stays in a live state forever.
 * Three things then break, quietly:
 *
 *   - `concurrentCallCount` counts it, so the tenant's line limit is consumed by
 *     a call that ended hours ago. Enough of them and no one can call in at all.
 *   - The call never gets its usage record, so its cost is invisible to the
 *     budget breaker.
 *   - The operator's dashboard shows a call in progress that is not.
 *
 * The sweeper is deliberately generous: it only touches rows older than the
 * agent's own maxCallSeconds plus a wide margin, so a genuinely long call is
 * never cut off by this.
 */
const GRACE_SECONDS = 600; // ten minutes past the agent's own limit
const FALLBACK_MAX_CALL_SECONDS = 1800;
const LIVE_STATUSES = ["QUEUED", "RINGING", "IN_PROGRESS", "CONNECTING", "ANSWERED"];

@Injectable()
export class StaleCallSweeperService implements OnModuleInit {
  private readonly logger = new Logger(StaleCallSweeperService.name);

  /** Also runs once at boot: a restart is the most common way calls get stranded. */
  async onModuleInit() {
    await this.sweep().catch((e) => this.logger.warn(`Startup sweep failed: ${e?.message}`));
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<{ closed: number }> {
    const candidates = await prisma.call.findMany({
      where: {
        status: { in: LIVE_STATUSES },
        startedAt: { lt: new Date(Date.now() - (FALLBACK_MAX_CALL_SECONDS + GRACE_SECONDS) * 1000) },
      },
      select: { id: true, organizationId: true, startedAt: true, agent: { select: { maxCallSeconds: true } } },
      take: 200,
    });

    let closed = 0;
    for (const call of candidates) {
      const limit = call.agent?.maxCallSeconds ?? FALLBACK_MAX_CALL_SECONDS;
      const ageSeconds = (Date.now() - new Date(call.startedAt).getTime()) / 1000;
      if (ageSeconds < limit + GRACE_SECONDS) continue;

      // updateMany with the status still in the live set, so a provider callback
      // arriving at the same moment wins and this becomes a no-op.
      const result = await prisma.call.updateMany({
        where: { id: call.id, status: { in: LIVE_STATUSES } },
        data: {
          status: "DISCONNECTED",
          endedAt: new Date(),
          durationSeconds: Math.round(Math.min(ageSeconds, limit)),
          endReason: "SWEPT_NO_PROVIDER_HANGUP",
        },
      });

      if (result.count > 0) {
        closed += 1;
        await prisma.callEvent
          .create({
            data: {
              callId: call.id,
              eventType: "SWEPT_STALE",
              toStatus: "DISCONNECTED",
              metadata: { ageSeconds: Math.round(ageSeconds), maxCallSeconds: limit },
            },
          })
          .catch(() => undefined);
      }
    }

    if (closed > 0) {
      this.logger.warn(`Closed ${closed} stale call(s) that never reported a hangup`);
    }
    return { closed };
  }
}
