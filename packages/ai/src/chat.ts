import { openai } from './client';
import { config } from '@qanoai/config';
import type { ChatCompletionMessageParam, ChatCompletionChunk, ChatCompletion } from 'openai/resources/chat/completions';
import { Stream } from 'openai/streaming';

export interface ChatCompletionRequest {
  messages: ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
}

export interface ChatCompletionResult {
  message: any;
  tokensUsed: number;
  cost: number;
}

// Approximated cost mapping for Phase 2 (Per 1M tokens)
const COST_MAP: Record<string, { prompt: number; completion: number }> = {
  'gpt-4-turbo': { prompt: 10, completion: 30 },
  'gpt-4o': { prompt: 5, completion: 15 },
  'gpt-3.5-turbo': { prompt: 0.5, completion: 1.5 },
};

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates = COST_MAP[model] || COST_MAP['gpt-3.5-turbo'];
  return (promptTokens / 1000000) * rates.prompt + (completionTokens / 1000000) * rates.completion;
}

export async function generateChatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResult> {
  const model = request.model || config.AI_DEFAULT_CHAT_MODEL;

  const response = await openai.chat.completions.create({
    model,
    messages: request.messages,
    temperature: request.temperature ?? 0.7,
    stream: false,
    tools: request.tools,
    tool_choice: request.tool_choice,
  }) as ChatCompletion;

  const usage = response.usage;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || 0;
  
  const cost = calculateCost(model, promptTokens, completionTokens);

  return {
    message: response.choices[0].message,
    tokensUsed: totalTokens,
    cost
  };
}

export async function generateChatCompletionStream(
  request: ChatCompletionRequest
): Promise<Stream<ChatCompletionChunk>> {
  const model = request.model || config.AI_DEFAULT_CHAT_MODEL;

  const stream = await openai.chat.completions.create({
    model,
    messages: request.messages,
    temperature: request.temperature ?? 0.7,
    stream: true,
  });

  return stream as Stream<ChatCompletionChunk>;
}
