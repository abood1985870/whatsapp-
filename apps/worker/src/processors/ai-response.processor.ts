import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';
import { queues, emitToOrganization } from '@qanoai/queue';
import { processAgentTurn } from '@qanoai/ai';

const logger = new Logger('AiResponseProcessor');

export async function processAiResponse(job: Job) {
  logger.log(`Generating AI response: ${job.id}`);
  const { organizationId, conversationId, agentId, content } = job.data;

  try {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      logger.warn(`Conversation ${conversationId} not found, skipping AI response`);
      return;
    }

    const startedAt = Date.now();
    const response = await processAgentTurn({
      organizationId,
      conversationId,
      agentId,
      message: content
    });
    const latencyMs = Date.now() - startedAt;

    if (response.decision === 'REPLY' && response.replyMessage) {
      // 1. Create message
      const aiMessage = await prisma.message.create({
        data: {
          organizationId,
          conversationId,
          channelConnectionId: conversation.channelConnectionId,
          contactId: conversation.contactId,
          direction: 'OUTBOUND',
          senderType: 'AI_AGENT',
          messageType: 'TEXT',
          text: response.replyMessage,
          providerStatus: 'PENDING',
          isAiGenerated: true
        }
      });

      // 2. Log run
      await prisma.aiRun.create({
        data: {
          organizationId,
          agentId,
          conversationId,
          status: 'COMPLETED',
          decision: response.decision,
          confidence: response.confidence,
          input: content,
          output: response.replyMessage,
          citations: response.citations,
          tokenUsage: response.tokenUsage !== undefined ? { total: response.tokenUsage } : undefined,
          costUsd: response.costUsd,
          latencyMs,
          completedAt: new Date()
        }
      });

      // 3. Broadcast to connected clients
      emitToOrganization(organizationId, 'message:new', {
        id: aiMessage.id,
        conversationId,
        text: aiMessage.text,
        direction: aiMessage.direction,
        senderType: aiMessage.senderType,
        createdAt: aiMessage.createdAt,
        providerStatus: aiMessage.providerStatus,
        isAiGenerated: aiMessage.isAiGenerated
      });

      // 4. Dispatch to outgoing queue
      await queues.whatsappOutgoing.add('send-ai-response', {
        messageId: aiMessage.id
      });
    } else if (response.decision === 'HANDOFF') {
      // 1. Update conversation mode to manual
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          mode: 'AI_ASSISTED',
          status: 'WAITING_FOR_AGENT',
          handoffReason: response.reason || 'AI triggered handoff'
        },
        include: { contact: true }
      });

      emitToOrganization(organizationId, 'conversation:updated', {
        id: updated.id,
        contact: { name: updated.contact.name, primaryPhone: updated.contact.primaryPhone, avatarUrl: updated.contact.avatarUrl },
        status: updated.status,
        mode: updated.mode,
        priority: updated.priority,
        lastMessageAt: updated.lastMessageAt
      });

      // 2. Log run
      await prisma.aiRun.create({
        data: {
          organizationId,
          agentId,
          conversationId,
          status: 'COMPLETED',
          decision: response.decision,
          confidence: response.confidence,
          input: content,
          errorMessage: response.reason,
          citations: response.citations,
          tokenUsage: response.tokenUsage !== undefined ? { total: response.tokenUsage } : undefined,
          costUsd: response.costUsd,
          latencyMs,
          completedAt: new Date()
        }
      });

      logger.log(`Conversation ${conversationId} handed off to human agents.`);
    }

    logger.log(`AI Response for conversation ${conversationId} generated successfully.`);
  } catch (error: any) {
    logger.error(`Error generating AI response: ${error.message}`);
    throw error;
  }
}
