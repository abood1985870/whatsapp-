import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { prisma } from "@qanoai/database";

/**
 * Frees campaign recipients stuck mid-send.
 *
 * A recipient is claimed atomically (QUEUED → SENDING) before the provider call
 * and moved on afterwards. If the process dies in between — a deploy, a crash,
 * an OOM kill — the row stays SENDING forever. Two consequences, both quiet:
 *
 *   - `inFlight` counts SENDING rows to decide whether to dispatch more, so a
 *     handful of stranded rows can stall a campaign permanently. The operator
 *     sees a campaign that is "running" and sending nothing.
 *   - The recipient is neither sent nor failed, so they are in no report.
 *
 * The rule for what to do with them is the careful part. A row that already has
 * a providerMessageId DID reach WhatsApp, so it is completed rather than
 * retried — re-sending would message the customer twice. A row with no provider
 * id is returned to QUEUED to be retried once, and marked failed after that,
 * because retrying forever is its own way of messaging someone repeatedly.
 */
const STRANDED_AFTER_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

@Injectable()
export class StrandedRecipientReaperService implements OnModuleInit {
  private readonly logger = new Logger(StrandedRecipientReaperService.name);

  async onModuleInit() {
    await this.reap().catch((e) => this.logger.warn(`Startup reap failed: ${e?.message}`));
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reap(): Promise<{ completed: number; requeued: number; failed: number }> {
    const cutoff = new Date(Date.now() - STRANDED_AFTER_MS);

    const stranded = await prisma.campaignRecipient.findMany({
      where: { status: "SENDING", lastAttemptAt: { lt: cutoff } },
      select: { id: true, providerMessageId: true, attemptCount: true, campaignId: true },
      take: 500,
    });
    if (stranded.length === 0) return { completed: 0, requeued: 0, failed: 0 };

    let completed = 0;
    let requeued = 0;
    let failed = 0;

    for (const row of stranded) {
      // It reached WhatsApp. The customer has the message; do not send it again.
      if (row.providerMessageId) {
        const result = await prisma.campaignRecipient.updateMany({
          where: { id: row.id, status: "SENDING" },
          data: { status: "SENT", sentAt: new Date() },
        });
        if (result.count > 0) {
          completed += 1;
          await prisma.campaign
            .update({ where: { id: row.campaignId }, data: { sentCount: { increment: 1 } } })
            .catch(() => undefined);
        }
        continue;
      }

      if ((row.attemptCount ?? 0) >= MAX_ATTEMPTS) {
        const result = await prisma.campaignRecipient.updateMany({
          where: { id: row.id, status: "SENDING" },
          data: {
            status: "FAILED",
            errorCode: "STRANDED_MAX_ATTEMPTS",
            errorMessage: "Send was interrupted repeatedly and did not complete",
          },
        });
        if (result.count > 0) {
          failed += 1;
          await prisma.campaign
            .update({ where: { id: row.campaignId }, data: { failedCount: { increment: 1 } } })
            .catch(() => undefined);
        }
        continue;
      }

      const result = await prisma.campaignRecipient.updateMany({
        where: { id: row.id, status: "SENDING" },
        data: { status: "QUEUED", errorCode: "STRANDED_REQUEUED", errorMessage: null },
      });
      if (result.count > 0) requeued += 1;
    }

    this.logger.warn(
      `Reaped stranded recipients — completed: ${completed}, requeued: ${requeued}, failed: ${failed}`
    );
    return { completed, requeued, failed };
  }
}
