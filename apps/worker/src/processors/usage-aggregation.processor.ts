import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';

const logger = new Logger('UsageAggregationProcessor');

export async function processUsageAggregation(job: Job) {
  logger.log(`Aggregating usage: ${job.id}`);
  const { organizationId, date } = job.data;
  
  try {
    const targetDate = new Date(date || new Date());
    targetDate.setHours(0, 0, 0, 0);

    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const events = await prisma.usageEvent.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: targetDate,
          lt: nextDate
        }
      }
    });

    if (events.length === 0) {
      logger.log(`No usage events for organization ${organizationId} on ${targetDate.toISOString()}`);
      return;
    }

    // Group by featureKey
    const aggregatedData: Record<string, number> = {};
    for (const event of events) {
      if (!aggregatedData[event.featureKey]) {
        aggregatedData[event.featureKey] = 0;
      }
      aggregatedData[event.featureKey] += event.quantity;
    }

    // Store in UsageAggregate
    for (const [featureKey, totalUsage] of Object.entries(aggregatedData)) {
      await prisma.usageAggregate.upsert({
        where: { organizationId_featureKey_period: { organizationId, featureKey, period: 'DAILY' } },
        create: {
          organizationId,
          featureKey,
          period: 'DAILY',
          periodStart: targetDate,
          periodEnd: nextDate,
          totalUsage
        },
        update: {
          periodStart: targetDate,
          periodEnd: nextDate,
          totalUsage
        }
      });
    }

    logger.log(`Aggregated usage for organization ${organizationId} successfully`);
  } catch (error: any) {
    logger.error(`Error aggregating usage: ${error.message}`);
    throw error;
  }
}
