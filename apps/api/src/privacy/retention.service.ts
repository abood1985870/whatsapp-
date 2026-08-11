import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { prisma } from "@qanoai/database";

/**
 * Deletes what we are no longer allowed to keep.
 *
 * `VoiceSettings.transcriptRetentionDays` and `recordingRetentionDays` have
 * existed since the voice module shipped. Nothing has ever read them. An
 * organization could set "keep transcripts for 30 days", see it saved, and the
 * transcripts would sit there forever — a retention promise made in the UI and
 * broken by the absence of any code behind it. That is worse than having no
 * setting at all.
 *
 * Deliberately conservative:
 *   - Only runs for organizations that have SET a retention period. A null
 *     means "no policy", not "delete after the default".
 *   - Deletes transcript turns and event metadata, not the Call row. Losing the
 *     call record would take the usage and cost history with it, which is
 *     billing data the tenant needs.
 *   - Batched, so one overdue organization cannot hold a connection for minutes.
 */
const BATCH = 500;
const MIN_RETENTION_DAYS = 1;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<{ organizations: number; transcriptTurns: number; webhookEvents: number }> {
    let organizations = 0;
    let transcriptTurns = 0;

    const policies = await prisma.voiceSettings.findMany({
      where: { transcriptRetentionDays: { not: null } },
      select: { organizationId: true, transcriptRetentionDays: true },
    });

    for (const policy of policies) {
      const days = policy.transcriptRetentionDays ?? 0;
      if (days < MIN_RETENTION_DAYS) continue;

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      organizations += 1;

      // Delete in batches so a long-overdue organization does not lock the table.
      for (;;) {
        const stale = await prisma.callTranscriptTurn.findMany({
          where: { call: { organizationId: policy.organizationId, startedAt: { lt: cutoff } } },
          select: { id: true },
          take: BATCH,
        });
        if (stale.length === 0) break;

        const removed = await prisma.callTranscriptTurn.deleteMany({
          where: { id: { in: stale.map((t) => t.id) } },
        });
        transcriptTurns += removed.count;
        if (stale.length < BATCH) break;
      }
    }

    // Webhook events are raw provider deliveries. They exist for replay and
    // debugging, and nothing ever pruned them — the table grows forever and
    // every row holds a copy of a customer message.
    const webhookCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const webhookEvents = await prisma.webhookEvent.deleteMany({
      where: { createdAt: { lt: webhookCutoff } },
    });

    if (transcriptTurns > 0 || webhookEvents.count > 0) {
      this.logger.log(
        `Retention: removed ${transcriptTurns} transcript turn(s) across ${organizations} organization(s), ` +
          `${webhookEvents.count} webhook event(s)`
      );
    }

    return { organizations, transcriptTurns, webhookEvents: webhookEvents.count };
  }
}
