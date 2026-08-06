import { openai } from './client';
import { config } from '@qanoai/config';

export interface GenerateEmbeddingsResponse {
  embeddings: number[][];
  tokensUsed: number;
  cost: number;
}

export async function generateEmbeddings(
  texts: string[],
  model: string = config.AI_DEFAULT_EMBEDDING_MODEL
): Promise<GenerateEmbeddingsResponse> {
  const response = await openai.embeddings.create({
    model,
    input: texts,
    // Must match the vector(1536) column in the Prisma schema
    dimensions: 1536,
  });

  const embeddings = response.data.map(d => d.embedding);
  // Some OpenAI-compatible providers (e.g. Gemini) omit the usage field
  const tokensUsed = response.usage?.total_tokens ?? 0;
  // Cost calculation for text-embedding-3-small (as of typical pricing)
  // Example: $0.02 / 1M tokens -> 0.00000002 per token
  const cost = tokensUsed * 0.00000002;

  return {
    embeddings,
    tokensUsed,
    cost
  };
}

export async function generateSingleEmbedding(text: string): Promise<number[]> {
  const res = await generateEmbeddings([text]);
  return res.embeddings[0];
}
