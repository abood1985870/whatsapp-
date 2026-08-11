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

/**
 * Longest input any masking pass will look at.
 *
 * A WhatsApp text body can be far longer than this, and the credit-card
 * pattern below is quadratic in the length of a run of digits and separators.
 * At 80,000 characters one message blocked the event loop for roughly four
 * seconds — with a 50 MB request body limit in front of it, that is a
 * single-request outage. Truncating costs nothing: PII this far into a
 * message is not what the masker exists for.
 */
export const MAX_MASK_INPUT_CHARS = 4000;

export function maskPII(input: string): string {
  if (!input) return input;

  let masked = input.length > MAX_MASK_INPUT_CHARS
    ? input.slice(0, MAX_MASK_INPUT_CHARS)
    : input;

  // Email. Written so no character class can match the same text two ways —
  // the previous form allowed '.' and '-' on both sides of the '@' and
  // backtracked exponentially on a long run of dots.
  masked = masked.replace(/[^\s@]{1,64}@[^\s@.]{1,255}\.[A-Za-z]{2,24}/g, '[EMAIL]');

  // Credit cards. Bounded on both sides so the separator run cannot grow.
  masked = masked.replace(/\b\d(?:[ -]?\d){12,15}\b/g, '[CREDIT_CARD]');

  // SSN-shaped ids.
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
