import { openai } from './client';
import IORedis from 'ioredis';
import { config } from '@qanoai/config';

export interface ModerationResult {
  flagged: boolean;
  reason?: string;
}

export function detectPromptInjection(input: string): ModerationResult {
  // Basic heuristic detection for prompt injection
  const lowerInput = input.toLowerCase();
  
  const suspiciousPatterns = [
    'ignore all previous instructions',
    'system prompt',
    'you are a developer',
    'bypass',
    'jailbreak',
    'forget your instructions'
  ];

  for (const pattern of suspiciousPatterns) {
    if (lowerInput.includes(pattern)) {
      return { flagged: true, reason: 'PROMPT_INJECTION' };
    }
  }

  return { flagged: false };
}

export function maskPII(input: string): string {
  // Very basic regex-based PII masking
  let masked = input;
  
  // Mask Email
  masked = masked.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL]');
  
  // Mask Credit Cards (simplified)
  masked = masked.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[CREDIT_CARD]');
  
  // Mask SSN / ID Numbers (simplified)
  masked = masked.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');

  return masked;
}

export function checkActionLimits(actionCount: number, limit: number = 5): boolean {
  return actionCount <= limit;
}

export async function moderateContent(input: string): Promise<ModerationResult> {
  try {
    const response = await openai.moderations.create({ input });
    const result = response.results[0];
    if (result.flagged) {
      const categories = Object.entries(result.categories)
        .filter(([, isFlagged]) => isFlagged)
        .map(([category]) => category);
      return { flagged: true, reason: `CONTENT_MODERATION: ${categories.join(', ')}` };
    }
    return { flagged: false };
  } catch {
    // Fail open: don't block a reply just because the moderation call itself errored
    return { flagged: false };
  }
}

const HUMAN_REQUEST_PATTERNS = [
  'human agent', 'talk to a human', 'talk to a person', 'real person', 'speak to someone',
  'customer service representative', 'human support',
  'موظف', 'انسان', 'إنسان', 'شخص حقيقي', 'تحدث مع موظف', 'اريد موظف', 'أريد موظف', 'مسؤول'
];

export function detectsHumanHandoffRequest(input: string): boolean {
  const lowerInput = input.toLowerCase();
  return HUMAN_REQUEST_PATTERNS.some(pattern => lowerInput.includes(pattern));
}

const ARABIC_RANGE = /[؀-ۿ]/;

export function detectLanguage(input: string, fallback: string = 'ar'): string {
  if (!input?.trim()) return fallback;
  return ARABIC_RANGE.test(input) ? 'ar' : 'en';
}

let rateLimitRedis: IORedis | null = null;
function getRateLimitRedis(): IORedis {
  if (!rateLimitRedis) {
    rateLimitRedis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return rateLimitRedis;
}

// Fixed-window rate limit: N AI responses per organization per minute.
export async function checkRateLimit(organizationId: string, limit: number = 30): Promise<boolean> {
  if (config.REDIS_DISABLED) {
    return true;
  }

  const redis = getRateLimitRedis();
  const windowKey = `ai:ratelimit:${organizationId}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.expire(windowKey, 60);
  }
  return count <= limit;
}
