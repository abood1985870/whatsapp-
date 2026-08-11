import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { AuditService } from "../audit/audit.service";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_REQUESTS_PER_CALL = 3;

export type VerificationOutcome =
  | { ok: true; scope: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "INVALID_CODE" | "ALREADY_USED" };

/**
 * Scoped, temporary caller verification.
 *
 * The model never sees or validates a code: it calls a tool, the tool is
 * refused with VERIFICATION_REQUIRED, and the orchestrator drives this
 * service. Codes are cryptographically random, hashed at rest, single-use,
 * expiring, and attempt-limited. A success authorizes one scope for one
 * call — never a permanent "trusted caller" flag.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(private readonly audit: AuditService) {}

  async startOtp(input: {
    organizationId: string;
    callId: string;
    contactId?: string | null;
    scope: string;
  }): Promise<{ started: boolean; reason?: string; code?: string }> {
    const requests = await prisma.verificationSession.count({
      where: { callId: input.callId, level: "OTP_REQUIRED" },
    });
    if (requests >= MAX_REQUESTS_PER_CALL) {
      return { started: false, reason: "TOO_MANY_REQUESTS" };
    }

    // 6-digit cryptographically secure code.
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await prisma.verificationSession.create({
      data: {
        organizationId: input.organizationId,
        callId: input.callId,
        contactId: input.contactId ?? null,
        scope: input.scope,
        level: "OTP_REQUIRED",
        codeHash: this.hash(code),
        maxAttempts: MAX_ATTEMPTS,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    await this.audit.log({
      organizationId: input.organizationId,
      action: "VOICE_OTP_REQUESTED",
      resourceType: "VerificationSession",
      resourceId: input.callId,
      // Deliberately no code, no phone number.
      metadata: { scope: input.scope },
      correlationId: generateCorrelationId(),
    });

    // The plaintext code is returned ONLY for handoff to the SMS sender.
    // It is never logged, never stored, and never placed in a transcript.
    return { started: true, code };
  }

  async verify(callId: string, scope: string, submittedCode: string): Promise<VerificationOutcome> {
    const session = await prisma.verificationSession.findFirst({
      where: { callId, scope, level: "OTP_REQUIRED", verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!session) return { ok: false, reason: "NOT_FOUND" };
    if (session.consumedAt) return { ok: false, reason: "ALREADY_USED" };
    if (session.expiresAt.getTime() < Date.now()) return { ok: false, reason: "EXPIRED" };
    if (session.attempts >= session.maxAttempts) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };

    await prisma.verificationSession.update({
      where: { id: session.id },
      data: { attempts: { increment: 1 } },
    });

    const submittedHash = this.hash(String(submittedCode).replace(/\D/g, ""));
    if (!session.codeHash || !this.constantTimeEquals(submittedHash, session.codeHash)) {
      return { ok: false, reason: "INVALID_CODE" };
    }

    await prisma.verificationSession.update({
      where: { id: session.id },
      data: { verifiedAt: new Date(), consumedAt: new Date() },
    });
    await this.audit.log({
      organizationId: session.organizationId,
      action: "VOICE_VERIFICATION_SUCCEEDED",
      resourceType: "VerificationSession",
      resourceId: session.id,
      metadata: { scope },
      correlationId: generateCorrelationId(),
    });

    return { ok: true, scope };
  }

  /** Scopes verified during this call, used by the tool authorization step. */
  async verifiedScopes(callId: string): Promise<string[]> {
    const sessions = await prisma.verificationSession.findMany({
      where: { callId, verifiedAt: { not: null }, expiresAt: { gt: new Date() } },
      select: { scope: true },
    });
    return sessions.map((s) => s.scope);
  }

  private hash(code: string): string {
    return createHash("sha256").update(code).digest("hex");
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
