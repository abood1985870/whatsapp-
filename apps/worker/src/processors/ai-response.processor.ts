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

    if (job.data.messageId) {
      const latestInbound = await prisma.message.findFirst({
        where: {
          conversationId,
          direction: 'INBOUND',
          senderType: 'CUSTOMER',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });

      if (latestInbound && latestInbound.id !== job.data.messageId) {
        logger.log(`Skipping stale AI job ${job.id}; newer inbound message exists for conversation ${conversationId}`);
        return;
      }
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
      const agent = await prisma.aiAgent.findUnique({ where: { id: agentId } });
      const handoffText = agent?.handoffMessage || agent?.fallbackMessage || 'وصلني طلبك، وبحوّله الآن لفريق الدعم عشان يرد عليك بدقة.';

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

      const handoffMessage = await prisma.message.create({
        data: {
          organizationId,
          conversationId,
          channelConnectionId: updated.channelConnectionId,
          contactId: updated.contactId,
          direction: 'OUTBOUND',
          senderType: 'AI_AGENT',
          messageType: 'TEXT',
          text: handoffText,
          providerStatus: 'PENDING',
          isAiGenerated: true
        }
      });

      emitToOrganization(organizationId, 'conversation:updated', {
        id: updated.id,
        contact: { name: updated.contact.name, primaryPhone: updated.contact.primaryPhone, avatarUrl: updated.contact.avatarUrl },
        status: updated.status,
        mode: updated.mode,
        priority: updated.priority,
        lastMessageAt: updated.lastMessageAt
      });
      emitToOrganization(organizationId, 'message:new', {
        id: handoffMessage.id,
        conversationId,
        text: handoffMessage.text,
        direction: handoffMessage.direction,
        senderType: handoffMessage.senderType,
        createdAt: handoffMessage.createdAt,
        providerStatus: handoffMessage.providerStatus,
        isAiGenerated: handoffMessage.isAiGenerated
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

      await queues.whatsappOutgoing.add('send-ai-handoff', {
        messageId: handoffMessage.id
      });

      logger.log(`Conversation ${conversationId} handed off to human agents.`);
    }

    logger.log(`AI Response for conversation ${conversationId} generated successfully.`);
  } catch (error: any) {
    logger.error(`Error generating AI response: ${error.message}`);
    throw error;
  }
}
