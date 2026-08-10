import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';
import { queues, emitToOrganization } from '@qanoai/queue';
import { markPendingSupportEscalation, processAgentTurn } from '@qanoai/ai';
import { config } from '@qanoai/config';
import axios from 'axios';

const logger = new Logger('AiResponseProcessor');

export async function processAiResponse(job: Job) {
  logger.log(`Generating AI response: ${job.id}`);
  const { organizationId, conversationId, agentId, content } = job.data;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true, connection: true }
    });
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

      await queues.whatsappOutgoing.add('send-ai-response', {
        messageId: aiMessage.id
      });
    } else if (response.decision === 'HANDOFF') {
      const agent = await prisma.aiAgent.findUnique({ where: { id: agentId } });
      const handoffText = agent?.handoffMessage || agent?.fallbackMessage || 'تم تحويلك إلى الدعم الفني.';

      // Keep AI mode unchanged so future answerable messages can still be handled.
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
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

      await markPendingSupportEscalation({
        conversationId,
        agentId,
        question: content,
        lastCustomerMessageId: job.data.messageId,
        supportPhoneNumber: agent?.supportPhoneNumber
      });

      if (agent?.supportPhoneNumber && conversation.connection.providerInstanceId) {
        await notifySupport({
          instanceId: conversation.connection.providerInstanceId,
          supportPhoneNumber: agent.supportPhoneNumber,
          customerName: conversation.contact.name,
          customerPhone: conversation.contact.primaryPhone,
          question: content,
          conversationId
        });
      } else {
        logger.warn(`Support notification skipped for conversation ${conversationId}; no support phone or WhatsApp instance configured.`);
      }

      logger.log(`Conversation ${conversationId} handed off to human agents.`);
    }

    logger.log(`AI Response for conversation ${conversationId} generated successfully.`);
  } catch (error: any) {
    logger.error(`Error generating AI response: ${error.message}`);
    throw error;
  }
}

async function notifySupport(input: {
  instanceId: string;
  supportPhoneNumber: string;
  customerName: string | null;
  customerPhone: string;
  question: string;
  conversationId: string;
}) {
  const conversationUrl = `${config.APP_URL || 'http://localhost:3000'}/app/inbox/${input.conversationId}`;
  const text = [
    'تنبيه دعم فني',
    `العميل: ${input.customerName || 'بدون اسم'}`,
    `رقم العميل: ${input.customerPhone}`,
    `السؤال: ${input.question}`,
    `المحادثة: ${conversationUrl}`
  ].join('\n');

  await axios.post(
    `${config.EVOLUTION_API_URL}/message/sendText/${input.instanceId}`,
    { number: input.supportPhoneNumber, text },
    {
      headers: {
        apikey: config.EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
}
