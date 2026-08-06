import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';

const logger = new Logger('DeadLetterProcessor');

export async function processDeadLetter(job: Job) {
  logger.log(`Processing dead letter job: ${job.id}`);
  const { failedJobId, queueName, error, data } = job.data;

  try {
    // We would typically log this to an external error tracking service like Sentry
    logger.error(`Dead letter from queue ${queueName} (Job ${failedJobId}): ${error}`);
    logger.error(`Job Data: ${JSON.stringify(data)}`);

    // For Phase 3, we simply log it to the console. 
    // In production, we might store this in a DeadLetter table in the DB.
  } catch (err: any) {
    logger.error(`Error processing dead letter: ${err.message}`);
    throw err;
  }
}
