import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';
import { config } from '@qanoai/config';
import { emitToOrganization } from '@qanoai/queue';
import axios from 'axios';

const logger = new Logger('WhatsAppOutgoingProcessor');

export async function processWhatsAppOutgoing(job: Job) {
  logger.log(`Processing outgoing WhatsApp message: ${job.id}`);
  const { messageId } = job.data;

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            contact: true,
            connection: true
          }
        }
      }
    });

    if (!message || message.providerStatus === 'SENT') {
      logger.log(`Message ${messageId} already sent or not found.`);
      return;
    }

    const instanceId = message.conversation.connection.providerInstanceId;
    const phone = message.conversation.contact.normalizedPhone;

    if (!instanceId) {
      throw new Error("No WhatsApp instance configured for this conversation");
    }

    // Call Evolution API
    const evolutionApiUrl = config.EVOLUTION_API_URL;
    const evolutionApiKey = config.EVOLUTION_API_KEY;

    const response = await axios.post(
      `${evolutionApiUrl}/message/sendText/${instanceId}`,
      {
        number: phone,
        text: message.text
      },
      {
        headers: {
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update DB status
    await prisma.message.update({
      where: { id: messageId },
      data: {
        providerStatus: 'SENT',
        providerMessageId: response.data?.key?.id || message.providerMessageId,
        sentAt: new Date()
      }
    });
    emitToOrganization(message.organizationId, 'message:status', { messageId, status: 'SENT' });

    logger.log(`Message ${messageId} sent successfully`);
  } catch (error: any) {
    logger.error(`Error sending message: ${error.message}`);
    // Mark as failed if it's the last attempt
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      const failed = await prisma.message.update({
        where: { id: messageId },
        data: { providerStatus: 'FAILED', providerErrorMessage: error.message, failedAt: new Date() }
      });
      emitToOrganization(failed.organizationId, 'message:status', { messageId, status: 'FAILED' });
    }
    throw error;
  }
}
