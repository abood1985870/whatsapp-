import { generateChatCompletion, ChatCompletionRequest } from './chat';
import { assembleContext } from './rag';
import { toolRegistry } from './tools';
import { maskPII, detectPromptInjection, checkActionLimits, checkRateLimit, moderateContent, detectsHumanHandoffRequest, detectLanguage } from './safety';
import { isWithinWorkingHours } from './working-hours';
import { prisma } from '@qanoai/database';

export interface AgentContext {
  organizationId: string;
  conversationId: string;
  agentId: string;
  message: string;
}

export type AgentDecision = 'REPLY' | 'ASK_CLARIFICATION' | 'CALL_TOOL' | 'HANDOFF' | 'NO_REPLY';

export interface AgentResponse {
  decision: AgentDecision;
  replyMessage?: string;
  toolCall?: any;
  confidence: number;
  reason?: string;
  citations?: any[];
  tokenUsage?: number;
  costUsd?: number;
}

/**
 * Nothing past this point of a single customer message is used for a decision.
 * Clamping here means every downstream scan — injection heuristics, moderation,
 * masking, retrieval — sees a bounded string, so no one of them can be turned
 * into a denial of service by pasting a wall of text into WhatsApp.
 */
const MAX_TURN_MESSAGE_CHARS = 4000;

export async function processAgentTurn(context: AgentContext): Promise<AgentResponse> {
  if (typeof context.message === 'string' && context.message.length > MAX_TURN_MESSAGE_CHARS) {
    context = { ...context, message: context.message.slice(0, MAX_TURN_MESSAGE_CHARS) };
  }

  // 1. Fetch Agent Configuration (needed by several checks below)
  const agent = await prisma.aiAgent.findUnique({
    where: { id: context.agentId }
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  // 2. Rate limiting - protects against runaway loops/abuse driving up cost
  const withinRateLimit = await checkRateLimit(context.organizationId);
  if (!withinRateLimit) {
    return { decision: 'HANDOFF', confidence: 0, reason: 'RATE_LIMIT_EXCEEDED' };
  }

  // 3. Action limit - cap automated actions per conversation
  const actionCount = await prisma.aiRun.count({ where: { conversationId: context.conversationId } });
  if (!checkActionLimits(actionCount)) {
    return { decision: 'HANDOFF', confidence: 0, reason: 'ACTION_LIMIT_REACHED' };
  }

  // 4. Safety Guardrails
  const injectionCheck = detectPromptInjection(context.message);
  if (injectionCheck.flagged) {
    return { decision: 'HANDOFF', confidence: 0, reason: 'PROMPT_INJECTION_DETECTED' };
  }

  const moderation = await moderateContent(context.message);
  if (moderation.flagged) {
    return { decision: 'HANDOFF', confidence: 0, reason: moderation.reason };
  }

  if (detectsHumanHandoffRequest(context.message)) {
    return { decision: 'HANDOFF', confidence: 1, reason: 'CUSTOMER_REQUESTED_HUMAN' };
  }

  // 5. Working hours - reply with the configured after-hours message instead
  // of running the model at all, if the agent is scoped to working hours only
  if (agent.workingHoursOnly) {
    const isOpen = await isWithinWorkingHours(context.organizationId);
    if (!isOpen) {
      return {
        decision: 'REPLY',
        replyMessage: agent.afterHoursMessage || agent.fallbackMessage || 'We are currently outside working hours and will respond as soon as we are back.',
        confidence: 1,
        reason: 'AFTER_HOURS'
      };
    }
  }

  const maskedMessage = maskPII(context.message);
  const detectedLanguage = detectLanguage(context.message, agent.defaultLanguage);

  // 6. Assemble RAG Context
  const { context: ragContext, citations } = await assembleContext(context.organizationId, maskedMessage, undefined, agent.id);

  // 7. Fetch Conversation History
  const history = await prisma.message.findMany({
    where: { conversationId: context.conversationId },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const chatMessages: any[] = history.reverse().map((msg: any) => ({
    role: msg.senderType === 'CUSTOMER' ? 'user' : 'assistant',
    content: msg.text || ''
  }));
  const latestMessageIsAlreadyInHistory = chatMessages.at(-1)?.role === 'user'
    && chatMessages.at(-1)?.content === maskedMessage;

  // Append System Prompt
  const systemPrompt = `
You are an AI Support Agent.
Name: ${agent.name}
Tone: ${agent.tone}
Respond in this language: ${detectedLanguage}

Instructions:
${agent.systemInstructions}

RAG Context (Use this to answer questions):
${ragContext}

Decide your action carefully. Use only the business facts found in the instructions, FAQ, or knowledge base. Do not invent prices, products, policies, availability, or technical claims. If the available context does not contain a reliable answer, choose HANDOFF.
`;

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...chatMessages,
    ...(latestMessageIsAlreadyInHistory ? [] : [{ role: 'user', content: maskedMessage }])
  ];

  // 5. Ask OpenAI to decide the next action and provide the response
  const request: ChatCompletionRequest = {
    messages: messagesPayload,
    tools: [
      {
        type: 'function',
        function: {
          name: 'agent_decision',
          description: 'Record the decision and the response of the agent',
          parameters: {
            type: 'object',
            properties: {
              decision: {
                type: 'string',
                enum: ['REPLY', 'ASK_CLARIFICATION', 'CALL_TOOL', 'HANDOFF', 'NO_REPLY']
              },
              replyMessage: {
                type: 'string',
                description: 'The response message to the user, if applicable.'
              },
              confidence: {
                type: 'number',
                description: 'Confidence score from 0.0 to 1.0'
              },
              reason: {
                type: 'string',
                description: 'Reason for the decision'
              }
            },
            required: ['decision', 'confidence']
          }
        }
      },
      ...toolRegistry.getOpenAITools()
    ],
    tool_choice: { type: 'function', function: { name: 'agent_decision' } } // Force decision output
  };

  const completion = await generateChatCompletion(request);
  const toolCall = completion.message.tool_calls?.[0];

  if (toolCall && toolCall.function.name === 'agent_decision') {
    const args = JSON.parse(toolCall.function.arguments);

    // Check Agent's Confidence Threshold
    if (args.decision === 'REPLY' && args.confidence < (agent.confidenceThreshold || 0.7)) {
      return {
        decision: 'HANDOFF',
        confidence: args.confidence,
        reason: 'CONFIDENCE_BELOW_THRESHOLD',
        citations,
        tokenUsage: completion.tokensUsed,
        costUsd: completion.cost
      };
    }

    return {
      decision: args.decision as AgentDecision,
      replyMessage: args.replyMessage,
      confidence: args.confidence,
      reason: args.reason,
      citations,
      tokenUsage: completion.tokensUsed,
      costUsd: completion.cost
    };
  }

  // Fallback
  return {
    decision: 'HANDOFF',
    confidence: 0,
    reason: 'UNEXPECTED_OPENAI_RESPONSE',
    citations,
    tokenUsage: completion.tokensUsed,
    costUsd: completion.cost
  };
}
