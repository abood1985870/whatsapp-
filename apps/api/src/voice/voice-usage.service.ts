import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { config } from "@qanoai/config";
import { generateCorrelationId } from "@qanoai/shared";
import { AuditService } from "../audit/audit.service";

export interface CallCostInputs {
  telephonySeconds: number;
  aiAudioSeconds: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  toolCallCount: number;
  followupCount: number;
}

/**
 * Cost accounting and the spending circuit breaker.
 *
 * `estimated` is always computed from configured rates. `actual` is written
 * only when the provider reports a real figure — the two are stored in
 * separate columns and never conflated in reporting.
 */
@Injectable()
export class VoiceUsageService {
  private readonly logger = new Logger(VoiceUsageService.name);

  constructor(private readonly audit: AuditService) {}

  /** Rates are configuration; when unset the estimate is 0, not a guess. */
  estimateCostMinor(inputs: CallCostInputs): number {
    const telephonyMinutes = inputs.telephonySeconds / 60;
    const aiMinutes = inputs.aiAudioSeconds / 60;
    const telephony = telephonyMinutes * config.VOICE_TELEPHONY_COST_PER_MINUTE_MINOR;
    const ai = aiMinutes * config.VOICE_AI_COST_PER_MINUTE_MINOR;
    return Math.round(telephony + ai);
  }

  periodKey(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  async record(organizationId: string, callId: string, inputs: CallCostInputs, actualCostMinor?: number) {
    const estimatedCostMinor = this.estimateCostMinor(inputs);
    await prisma.voiceUsageRecord.create({
      data: {
        organizationId,
        callId,
        periodKey: this.periodKey(),
        telephonySeconds: inputs.telephonySeconds,
        aiAudioSeconds: inputs.aiAudioSeconds,
        aiInputTokens: inputs.aiInputTokens,
        aiOutputTokens: inputs.aiOutputTokens,
        toolCallCount: inputs.toolCallCount,
        followupCount: inputs.followupCount,
        estimatedCostMinor,
        actualCostMinor: actualCostMinor ?? null,
      },
    });
    return estimatedCostMinor;
  }

  /**
   * Circuit breaker consulted BEFORE a new expensive session starts.
   * In-flight calls are never cut off by a budget check.
   */
  async isOverBudget(organizationId: string): Promise<{ blocked: boolean; scope?: "DAILY" | "MONTHLY" }> {
    const settings = await prisma.voiceSettings.findUnique({ where: { organizationId } });
    if (!settings?.dailyBudgetMinor && !settings?.monthlyBudgetMinor) return { blocked: false };

    const now = new Date();
    if (settings.dailyBudgetMinor) {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const spent = await this.spendSince(organizationId, dayStart);
      if (spent >= settings.dailyBudgetMinor) return { blocked: true, scope: "DAILY" };
    }
    if (settings.monthlyBudgetMinor) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const spent = await this.spendSince(organizationId, monthStart);
      if (spent >= settings.monthlyBudgetMinor) return { blocked: true, scope: "MONTHLY" };
    }
    return { blocked: false };
  }

  async notifyBudgetBlock(organizationId: string, scope: string) {
    this.logger.warn(`Voice budget circuit breaker tripped for org ${organizationId} (${scope})`);
    await this.audit
      .log({
        organizationId,
        action: "VOICE_BUDGET_CIRCUIT_BREAKER",
        resourceType: "VoiceSettings",
        metadata: { scope },
        correlationId: generateCorrelationId(),
      })
      .catch(() => undefined);
  }

  /** Concurrency limit is a real tenant resource limit, enforced server-side. */
  async concurrentCallCount(organizationId: string): Promise<number> {
    return prisma.call.count({
      where: {
        organizationId,
        status: { notIn: ["COMPLETED", "DISCONNECTED", "FAILED"] },
      },
    });
  }

  private async spendSince(organizationId: string, since: Date): Promise<number> {
    const rows = await prisma.voiceUsageRecord.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { estimatedCostMinor: true, actualCostMinor: true },
    });
    // Prefer the actual figure where the provider gave us one.
    return rows.reduce((sum, r) => sum + (r.actualCostMinor ?? r.estimatedCostMinor), 0);
  }
}
