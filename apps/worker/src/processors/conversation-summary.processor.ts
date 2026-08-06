import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '@qanoai/database';
import { generateChatCompletion } from '@qanoai/ai';

const logger = new Logger('ConversationSummaryProcessor');

export async function processConversationSummary(job: Job) {
  logger.log(`Processing conversation summary: ${job.id}`);
  const { conversationId } = job.data;

  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });

    if (messages.length === 0) {
      return;
    }

    const transcript = messages.map((m: any) => `${m.senderType}: ${m.text || ''}`).join('\n');

    const completion = await generateChatCompletion({
      messages: [
        { role: 'system', content: 'Summarize the following customer support conversation in 1-2 short sentences.' },
        { role: 'user', content: transcript }
      ]
    });

    const summary = completion.message.content;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { summary }
    });

    logger.log(`Conversation ${conversationId} summarized successfully`);
  } catch (error: any) {
    logger.error(`Error summarizing conversation: ${error.message}`);
    throw error;
  }
}
