import { createWorker, QUEUE_NAMES } from "@qanoai/queue";
import { Logger } from "@nestjs/common";
import { processWhatsAppOutgoing } from "./processors/whatsapp-outgoing.processor";
import { processAiResponse } from "./processors/ai-response.processor";
import { processDocumentIngestion } from "./processors/document-ingestion.processor";
import { processConversationSummary } from "./processors/conversation-summary.processor";
import { processUsageAggregation } from "./processors/usage-aggregation.processor";
import { processScheduledReports } from "./processors/scheduled-reports.processor";
import { processCleanup } from "./processors/cleanup.processor";
import { processDeadLetter } from "./processors/dead-letter.processor";

const logger = new Logger("Worker");

const workers = [
  createWorker(QUEUE_NAMES.WHATSAPP_OUTGOING, processWhatsAppOutgoing),
  createWorker(QUEUE_NAMES.AI_RESPONSE, processAiResponse),
  createWorker(QUEUE_NAMES.DOCUMENT_INGESTION, processDocumentIngestion),
  createWorker(QUEUE_NAMES.CONVERSATION_SUMMARY, processConversationSummary),
  createWorker(QUEUE_NAMES.USAGE_AGGREGATION, processUsageAggregation),
  createWorker(QUEUE_NAMES.SCHEDULED_REPORTS, processScheduledReports),
  createWorker(QUEUE_NAMES.CLEANUP, processCleanup),
  createWorker(QUEUE_NAMES.DEAD_LETTER, processDeadLetter),
];

// Add global error handlers for workers
workers.forEach(worker => {
  worker.on('failed', (job: any, err: any) => {
    logger.error(`Job ${job?.id} in queue ${worker.name} failed: ${err.message}`);
    // If it's reached max attempts, push to dead letter queue
    if (job?.attemptsMade === job?.opts.attempts && worker.name !== `${process.env.QUEUE_PREFIX || 'qanoai'}:${QUEUE_NAMES.DEAD_LETTER}`) {
      const { queues } = require('@qanoai/queue');
      queues.deadLetter.add('dead-letter-job', {
        failedJobId: job.id,
        queueName: worker.name,
        error: err.message,
        data: job.data
      });
    }
  });

  worker.on('error', (err: any) => {
    logger.error(`Worker error in ${worker.name}: ${err.message}`);
  });
});

logger.log("🚀 Workers started");
logger.log("  - WhatsApp Outgoing");
logger.log("  - AI Response");
logger.log("  - Document Ingestion");
logger.log("  - Conversation Summary");
logger.log("  - Usage Aggregation");
logger.log("  - Scheduled Reports");
logger.log("  - Cleanup");
logger.log("  - Dead Letter Queue");

// Periodic jobs - without these, the cleanup/aggregation/report queues
// have no producer at all and their workers never run.
async function registerSchedules() {
  const { queues } = await import("@qanoai/queue");
  const orgs = await (await import("@qanoai/database")).prisma.organization.findMany({ select: { id: true } });

  await queues.cleanup.add("daily-cleanup", {}, {
    repeat: { pattern: "0 3 * * *" }, // 3am daily
    jobId: "cleanup-daily"
  });

  for (const org of orgs) {
    await queues.usageAggregation.add("daily-usage", { organizationId: org.id }, {
      repeat: { pattern: "30 0 * * *" }, // 00:30 daily
      jobId: `usage-daily-${org.id}`
    });
  }

  logger.log(`Registered repeatable jobs (cleanup + usage aggregation for ${orgs.length} orgs)`);
}
registerSchedules().catch(err => logger.error(`Failed to register schedules: ${err.message}`));

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.log("Shutting down workers...");
  await Promise.all(workers.map(w => w.close()));
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.log("Shutting down workers...");
  await Promise.all(workers.map(w => w.close()));
  process.exit(0);
});
