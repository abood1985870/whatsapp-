import { prisma } from '@qanoai/database';
import { normalizePhone } from '@qanoai/shared';

export interface PendingSupportEscalation {
  agentId: string;
  question: string;
  lastCustomerMessageId?: string;
  supportPhoneNumber?: string;
  status: 'PENDING';
  notifiedAt?: string;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function getPendingSupportEscalation(metadata: unknown): PendingSupportEscalation | null {
  const pending = asRecord(metadata).pendingSupportEscalation;
  if (!pending || typeof pending !== 'object') return null;
  if (!pending.agentId || !pending.question || pending.status !== 'PENDING') return null;
  return pending as PendingSupportEscalation;
}

export async function markPendingSupportEscalation(input: {
  conversationId: string;
  agentId: string;
  question: string;
  lastCustomerMessageId?: string;
  supportPhoneNumber?: string | null;
}): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { metadata: true }
  });
  if (!conversation) return;

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      metadata: {
        ...asRecord(conversation.metadata),
        pendingSupportEscalation: {
          agentId: input.agentId,
          question: input.question,
          lastCustomerMessageId: input.lastCustomerMessageId,
          supportPhoneNumber: input.supportPhoneNumber ? normalizePhone(input.supportPhoneNumber) : undefined,
          status: 'PENDING',
          notifiedAt: new Date().toISOString()
        }
      }
    }
  });
}

export async function findPendingEscalationForSupportPhone(input: {
  organizationId: string;
  supportPhoneNumber: string;
}): Promise<any | null> {
  const normalizedSupportPhone = normalizePhone(input.supportPhoneNumber);
  const conversations = await prisma.conversation.findMany({
    where: {
      organizationId: input.organizationId,
      deletedAt: null,
      status: { notIn: ['RESOLVED', 'CLOSED', 'SPAM', 'BLOCKED'] }
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
    include: { contact: true, connection: true }
  });

  return conversations.find((conversation: any) => {
    const pending = getPendingSupportEscalation(conversation.metadata);
    return pending?.supportPhoneNumber === normalizedSupportPhone;
  }) || null;
}

export async function learnFromSupportReply(input: {
  conversationId: string;
  answer: string;
  sourceMessageId?: string;
  source: 'WHATSAPP_SUPPORT_REPLY' | 'INBOX_HUMAN_REPLY';
}): Promise<any | null> {
  const answer = input.answer.trim();
  if (!answer) return null;

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { organizationId: true, metadata: true }
  });
  if (!conversation) return null;

  const pending = getPendingSupportEscalation(conversation.metadata);
  if (!pending?.question?.trim()) return null;

  const agent = await prisma.aiAgent.findUnique({
    where: { id: pending.agentId },
    select: { id: true, organizationId: true, autoLearningEnabled: true, learningScope: true, defaultLanguage: true }
  });
  if (!agent || agent.organizationId !== conversation.organizationId || !agent.autoLearningEnabled) return null;

  const existing = await prisma.faqEntry.findFirst({
    where: {
      organizationId: conversation.organizationId,
      question: pending.question,
      answer,
      sourceConversationId: input.conversationId
    },
    select: { id: true }
  });
  if (existing) return null;

  return prisma.faqEntry.create({
    data: {
      organizationId: conversation.organizationId,
      agentId: agent.learningScope === 'AGENT' ? agent.id : null,
      question: pending.question,
      answer,
      category: 'Auto-learned',
      language: agent.defaultLanguage || 'ar',
      source: input.source,
      sourceConversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      isActive: true
    }
  });
}
