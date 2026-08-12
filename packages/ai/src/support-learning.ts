import { prisma } from '@qanoai/database';
import { normalizePhone } from '@qanoai/shared';
import { maskPII } from './safety';

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

/**
 * Consume a pending escalation, exactly once.
 *
 * The flag was previously set and never cleared, so a conversation stayed in
 * "waiting for the support person's answer" forever. Every subsequent message
 * that person sent from their own phone — to anyone, about anything — was
 * matched against that open escalation and forwarded verbatim to the customer.
 *
 * The status check lives inside the UPDATE's WHERE clause rather than in a
 * read-then-write, so two replies arriving at once cannot both claim it: the
 * database decides, and the loser gets a count of 0.
 */
export async function claimPendingSupportEscalation(
  conversationId: string
): Promise<PendingSupportEscalation | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { metadata: true }
  });
  if (!conversation) return null;

  const pending = getPendingSupportEscalation(conversation.metadata);
  if (!pending) return null;

  const claimed = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      metadata: { path: ['pendingSupportEscalation', 'status'], equals: 'PENDING' }
    },
    data: {
      metadata: {
        ...asRecord(conversation.metadata),
        pendingSupportEscalation: {
          ...pending,
          status: 'ANSWERED',
          answeredAt: new Date().toISOString()
        }
      }
    }
  });

  return claimed.count === 1 ? pending : null;
}

export async function learnFromSupportReply(input: {
  conversationId: string;
  answer: string;
  sourceMessageId?: string;
  source: 'WHATSAPP_SUPPORT_REPLY' | 'INBOX_HUMAN_REPLY';
  /** Supplied by callers that already claimed the escalation and cleared the flag. */
  pending?: PendingSupportEscalation | null;
}): Promise<any | null> {
  const answer = input.answer.trim();
  if (!answer) return null;

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { organizationId: true, metadata: true }
  });
  if (!conversation) return null;

  const pending = input.pending ?? getPendingSupportEscalation(conversation.metadata);
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
      // Both sides are masked. The question is a customer's own words and the
      // answer is a support person's reply typed in a hurry — either can carry
      // an email, a card number or an id, and this row becomes retrieval
      // context that the AI can quote back to a DIFFERENT customer later.
      question: maskPII(pending.question),
      answer: maskPII(answer),
      category: 'Auto-learned',
      language: agent.defaultLanguage || 'ar',
      source: input.source,
      sourceConversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      // Pending review, NOT live.
      //
      // This wrote isActive: true, so a single reply from the support phone
      // became something the AI would repeat to every future customer who asked
      // a similar question — with no one having approved it. A wrong answer, a
      // stale price, or a message meant for one person entered the knowledge
      // base permanently and silently. Someone has to say yes first.
      isActive: false
    }
  });
}
