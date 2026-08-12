import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { config } from "@qanoai/config";

const TOKEN_TTL_MS = 2 * 60 * 1000;

/**
 * Short-lived, single-use token binding a media-stream WebSocket to one
 * call. The media endpoint is reachable by the telephony provider and must
 * therefore authenticate every connection — an unauthenticated socket could
 * otherwise inject audio into someone else's call.
 */
@Injectable()
export class StreamTokenService {
  private readonly used = new Set<string>();

  issue(callId: string): string {
    const nonce = randomBytes(8).toString("hex");
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const payload = `${callId}.${nonce}.${expiresAt}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string): { valid: boolean; callId?: string; reason?: string } {
    const parts = String(token || "").split(".");
    if (parts.length !== 4) return { valid: false, reason: "MALFORMED" };
    const [callId, nonce, expiresAtRaw, signature] = parts;

    const payload = `${callId}.${nonce}.${expiresAtRaw}`;
    if (!this.constantTimeEquals(this.sign(payload), signature)) return { valid: false, reason: "BAD_SIGNATURE" };

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return { valid: false, reason: "EXPIRED" };

    if (this.used.has(nonce)) return { valid: false, reason: "ALREADY_USED" };
    this.used.add(nonce);
    // Bounded memory: nonces outlive their token lifetime only briefly.
    setTimeout(() => this.used.delete(nonce), TOKEN_TTL_MS).unref?.();

    return { valid: true, callId };
  }

  private sign(payload: string): string {
    // Falls back to AUTH_SECRET so the token is never unsigned.
    const secret = config.VOICE_STREAM_TOKEN_SECRET || config.AUTH_SECRET;
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
