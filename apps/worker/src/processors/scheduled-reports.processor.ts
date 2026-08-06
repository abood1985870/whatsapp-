import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';

const logger = new Logger('ScheduledReportsProcessor');

export async function processScheduledReports(job: Job) {
  logger.log(`Processing scheduled report: ${job.id}`);
  const { reportId, organizationId } = job.data;

  try {
    const report = await prisma.scheduledReport.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    // Generate report logic
    // We would query analytics data and generate a file/CSV
    logger.log(`Generating report ${report.name} for organization ${organizationId}`);

    // Create ReportRun
    await prisma.reportRun.create({
      data: {
        reportId,
        status: 'COMPLETED',
        resultUrl: 'http://localhost:9000/qanoai-reports/mock-report.csv' // Mock URL
      }
    });

    // In a real app we might email it here as well
    logger.log(`Scheduled report ${reportId} generated successfully`);
  } catch (error: any) {
    logger.error(`Error processing scheduled report: ${error.message}`);
    await prisma.reportRun.create({
      data: {
        reportId,
        status: 'FAILED',
        errorMessage: error.message
      }
    });
    throw error;
  }
}
