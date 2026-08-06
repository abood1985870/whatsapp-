import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';

const logger = new Logger('CleanupProcessor');

export async function processCleanup(job: Job) {
  logger.log(`Processing cleanup: ${job.id}`);

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Clean up old usage events
    const deletedUsage = await prisma.usageEvent.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo
        }
      }
    });

    logger.log(`Deleted ${deletedUsage.count} old usage events`);

    // 2. Archive old conversations (e.g. set status to ARCHIVED if closed long time ago)
    // Assuming we have an ARCHIVED status, or we soft delete them.
    // For Phase 3, we'll just log this action.

    logger.log(`Cleanup completed successfully`);
  } catch (error: any) {
    logger.error(`Error processing cleanup: ${error.message}`);
    throw error;
  }
}
