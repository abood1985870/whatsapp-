import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from "@nestjs/common";

/**
 * Rate limiting for the credential endpoints.
 *
 * The global limiter allows 1000 requests per IP per 15 minutes, which is
 * roughly 1000 password guesses — per IP, and with `trust proxy` previously
 * misconfigured, per the whole internet at once. These endpoints need their own
 * much tighter budget, counted per IP AND per account, so spreading an attack
 * across addresses does not buy an attacker anything against one account.
 *
 * In-memory on purpose: the API runs as a single process behind gateway.js. If
 * that ever changes this must move to Redis, and the comment should move with
 * it — a per-process limiter behind several replicas silently multiplies the
 * budget by the replica count.
 */
type Bucket = { count: number; resetAt: number; lockedUntil?: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 30;
const MAX_PER_ACCOUNT = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

const buckets = new Map<string, Bucket>();

/** Keeps the map from growing without bound on a long-running process. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now && (!b.lockedUntil || b.lockedUntil <= now)) buckets.delete(key);
  }
}

function hit(key: string, max: number, now: number): { blocked: boolean; retryAfter: number } {
  const bucket = buckets.get(key);

  if (bucket?.lockedUntil && bucket.lockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((bucket.lockedUntil - now) / 1000) };
  }

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { blocked: false, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    // Backoff grows with how far past the limit the caller is.
    const overage = bucket.count - max;
    bucket.lockedUntil = now + LOCKOUT_MS * Math.min(overage, 4);
    return { blocked: true, retryAfter: Math.ceil((bucket.lockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfter: 0 };
}

@Injectable()
export class AuthThrottleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const now = Date.now();
    sweep(now);

    const route = request.route?.path || request.url;
    const ip = request.ip || request.socket?.remoteAddress || "unknown";
    const account = String(request.body?.email || request.body?.token || "").toLowerCase().slice(0, 200);

    const checks = [hit(`ip:${route}:${ip}`, MAX_PER_IP, now)];
    if (account) checks.push(hit(`acct:${route}:${account}`, MAX_PER_ACCOUNT, now));

    const blocked = checks.find((c) => c.blocked);
    if (blocked) {
      throw new HttpException(
        { error: { code: "TOO_MANY_ATTEMPTS", retryAfterSeconds: blocked.retryAfter } },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    return true;
  }
}

/** Exposed for tests, which need a clean slate between cases. */
export function __resetAuthThrottle() {
  buckets.clear();
}
