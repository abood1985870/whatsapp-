import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { config } from "@qanoai/config";
import { generateCorrelationId } from "@qanoai/shared";
import { AuditService } from "../audit/audit.service";

/** 1 USD ≈ 3.75 SAR = 375 halalas. Same rate the campaign accounting uses. */
const USD_TO_HALALAS = 375;

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
  async isOverBudget(
    organizationId: string
  ): Promise<{ blocked: boolean; scope?: "DAILY" | "MONTHLY" | "UNPRICED" }> {
    const settings = await prisma.voiceSettings.findUnique({ where: { organizationId } });
    if (!settings?.dailyBudgetMinor && !settings?.monthlyBudgetMinor) return { blocked: false };

    // FAIL CLOSED. Both rates default to 0, so every estimate was 0, every
    // spend total was 0, and a configured budget could never be reached — the
    // breaker was wired up and permanently disarmed. An organization that set a
    // budget asked for a spending limit; refusing calls is the correct answer
    // when we cannot price them, not letting them run unmetered.
    if (
      config.VOICE_TELEPHONY_COST_PER_MINUTE_MINOR <= 0 &&
      config.VOICE_AI_COST_PER_MINUTE_MINOR <= 0
    ) {
      this.logger.error(
        `Voice budget is set for org ${organizationId} but VOICE_TELEPHONY_COST_PER_MINUTE_MINOR ` +
          `and VOICE_AI_COST_PER_MINUTE_MINOR are both 0 — calls are blocked because spend cannot ` +
          `be measured. Set both rates in the environment.`
      );
      return { blocked: true, scope: "UNPRICED" };
    }

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
    const voiceSpend = rows.reduce((sum, r) => sum + (r.actualCostMinor ?? r.estimatedCostMinor), 0);

    // Model spend counts against the same budget.
    //
    // The breaker measured telephony and realtime-audio minutes only, so every
    // chat completion the organization made — support replies, summaries, sales
    // personalization — was invisible to it. An organization could sit at zero
    // "voice spend" while its actual OpenAI bill ran away.
    const aiRuns = await prisma.aiRun.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _sum: { costUsd: true },
    });
    const aiSpendMinor = Math.round((Number(aiRuns._sum.costUsd) || 0) * USD_TO_HALALAS);

    return voiceSpend + aiSpendMinor;
  }
}
