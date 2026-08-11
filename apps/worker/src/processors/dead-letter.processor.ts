import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { redactObject } from '@qanoai/shared';

const logger = new Logger('DeadLetterProcessor');

/**
 * Last stop for a job that exhausted its retries.
 *
 * This used to write `JSON.stringify(data)` to the log. A failed
 * whatsapp-outgoing job carries the customer's phone number and the full text
 * of the message; a failed campaign job carries the recipient list. So the one
 * place guaranteed to run when something goes wrong was also the place that
 * copied customer data into the log stream — where it is retained, shipped to
 * whatever aggregator the platform uses, and readable by anyone with log
 * access.
 *
 * What is actually needed to debug a dead job is which job, from which queue,
 * with what error, and the IDS involved. Not the contents.
 */
const ID_KEYS = [
  'messageId', 'conversationId', 'organizationId', 'contactId', 'campaignId',
  'recipientId', 'leadId', 'callId', 'agentId', 'connectionId', 'jobId',
];

function identifiersOf(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const key of ID_KEYS) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export async function processDeadLetter(job: Job) {
  const { failedJobId, queueName, error, data } = job.data ?? {};

  try {
    logger.error(
      `Dead letter from queue ${queueName} (job ${failedJobId}): ${String(error).slice(0, 500)}`
    );

    // Identifiers first — they are what you actually search by.
    const ids = identifiersOf(data);
    if (Object.keys(ids).length > 0) {
      logger.error(`Dead letter identifiers: ${JSON.stringify(ids)}`);
    } else {
      // Nothing recognisable: fall back to a redacted shape so the job is not
      // completely opaque, without printing message bodies or phone numbers.
      logger.error(`Dead letter payload (redacted): ${JSON.stringify(redactObject(data))}`);
    }
  } catch (err: any) {
    logger.error(`Error processing dead letter: ${err.message}`);
    throw err;
  }
}
