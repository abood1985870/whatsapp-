import { Queue, Worker, Job } from "bullmq";
import { Emitter } from "@socket.io/redis-emitter";
import { config } from "@qanoai/config";
import IORedis from "ioredis";

const redisDisabled = config.REDIS_DISABLED;

const redisConnection: any = redisDisabled
  ? {
      duplicate: () => redisConnection,
      ping: async () => "DISABLED",
      quit: async () => undefined,
    }
  : new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

// Publishes into the same Redis channels the realtime server's
// @socket.io/redis-adapter subscribes to, so API/worker processes can push
// live events without running their own Socket.IO server.
const realtimeEmitter: any = redisDisabled ? null : new Emitter(redisConnection.duplicate());

export function emitToOrganization(organizationId: string, event: string, data: any): void {
  if (redisDisabled) return;
  realtimeEmitter.to(`org:${organizationId}`).emit(event, data);
}

export function emitToConversation(conversationId: string, event: string, data: any): void {
  if (redisDisabled) return;
  realtimeEmitter.to(`conv:${conversationId}`).emit(event, data);
}

export const QUEUE_NAMES = {
  WHATSAPP_OUTGOING: "whatsapp-outgoing",
  MEDIA_DOWNLOAD: "media-download",
  DOCUMENT_INGESTION: "document-ingestion",
  EMBEDDING_GENERATION: "embedding-generation",
  AI_RESPONSE: "ai-response",
  CONVERSATION_SUMMARY: "conversation-summary",
  NOTIFICATIONS: "notifications",
  USAGE_AGGREGATION: "usage-aggregation",
  SCHEDULED_REPORTS: "scheduled-reports",
  CLEANUP: "cleanup",
  DEAD_LETTER: "dead-letter",
} as const;

export function createQueue(name: string): Queue {
  if (redisDisabled) {
    return {
      add: async () => {
        throw new Error("Redis queues are disabled");
      },
    } as unknown as Queue;
  }

  return new Queue(name, {
    prefix: config.QUEUE_PREFIX || "qanoai",
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
}

export function createWorker(
  name: string,
  processor: (job: Job) => Promise<void>
): Worker {
  if (redisDisabled) {
    throw new Error(`Redis workers are disabled: ${name}`);
  }

  return new Worker(name, processor, {
    prefix: config.QUEUE_PREFIX || "qanoai",
    connection: redisConnection,
    concurrency: 5,
  });
}

export const queues = {
  whatsappOutgoing: createQueue(QUEUE_NAMES.WHATSAPP_OUTGOING),
  mediaDownload: createQueue(QUEUE_NAMES.MEDIA_DOWNLOAD),
  documentIngestion: createQueue(QUEUE_NAMES.DOCUMENT_INGESTION),
  embeddingGeneration: createQueue(QUEUE_NAMES.EMBEDDING_GENERATION),
  aiResponse: createQueue(QUEUE_NAMES.AI_RESPONSE),
  conversationSummary: createQueue(QUEUE_NAMES.CONVERSATION_SUMMARY),
  notifications: createQueue(QUEUE_NAMES.NOTIFICATIONS),
  usageAggregation: createQueue(QUEUE_NAMES.USAGE_AGGREGATION),
  scheduledReports: createQueue(QUEUE_NAMES.SCHEDULED_REPORTS),
  cleanup: createQueue(QUEUE_NAMES.CLEANUP),
  deadLetter: createQueue(QUEUE_NAMES.DEAD_LETTER),
};

export { redisConnection };
