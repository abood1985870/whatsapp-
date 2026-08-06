import OpenAI from 'openai';
import { config } from '@qanoai/config';

// Initialize the OpenAI client with exponential backoff retry and timeout
export const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
  timeout: 30000, // 30s timeout per Phase 2 requirements
  maxRetries: 3,  // Exponential backoff retries per Phase 2 requirements
});
