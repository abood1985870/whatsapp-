import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, normalizePhone, normalizePhoneStrict } from "@qanoai/shared";
import { VOICE_CAPABILITIES } from "@qanoai/permissions";
import {
  buildFailsafeMessage,
  buildSilenceProbeMessage,
  buildVoiceSalesInstructions,
  buildWrapUpNotice,
  summarizeCall,
  VOICE_SALES_PROMPT_VERSION,
  VoiceProductContext,
} from "@qanoai/ai";
import { AuditService } from "../audit/audit.service";
import { MarketingEntitlementsService } from "../marketing/entitlements.service";
import { HotLeadService } from "../marketing/sales/hot-lead.service";
import { LeadsService } from "../marketing/leads/leads.service";
import { formatSarMinor } from "../marketing/sales/discount.service";
import { OpenAiRealtimeProvider } from "./providers/openai-realtime.provider";
import { RealtimeEvent } from "./providers/realtime-ai.provider";
import { CallerIdentityService } from "./caller-identity.service";
import { CallSession } from "./call-session";
import { CallStatus, canTransition, isTerminal } from "./call-state-machine";
import { StreamTokenService } from "./stream-token.service";
import { VerificationService } from "./verification.service";
import { VoiceSettingsService } from "./voice-settings.service";
import { VoiceUsageService } from "./voice-usage.service";
import { VoiceToolExecutorService } from "./tools/voice-tool-executor.service";

export type AdmissionDecision =
  | { admitted: true; callId: string; streamToken: string; greeting?: string }
  | { admitted: false; reason: string; spokenMessage: string };

/**
 * Owns the lifecycle of every live call: admission control, state machine,
 * realtime session, audio bridging, tool dispatch, silence/loop/duration
 * policy, and post-call processing.
 *
 * Sessions live in a Map keyed by callId so concurrent calls are fully
 * isolated (no shared transcript, tenant, or audio state).
 */
@Injectable()
export class CallOrchestratorService {
  private readonly logger = new Logger(CallOrchestratorService.name);
  private readonly sessions = new Map<string, CallSession>();

  constructor(
    private readonly realtimeProvider: OpenAiRealtimeProvider,
    private readonly identity: CallerIdentityService,
    private readonly settings: VoiceSettingsService,
    private readonly usage: VoiceUsageService,
    private readonly tools: VoiceToolExecutorService,
    private readonly verification: VerificationService,
    private readonly streamTokens: StreamTokenService,
    private readonly entitlements: MarketingEntitlementsService,
    private readonly hotLead: HotLeadService,
    private readonly leads: LeadsService,
    private readonly audit: AuditService
  ) {}

  // ---------------------------------------------------------------- admission

  /**
   * Decide whether to accept an inbound call and create its record.
   * Idempotent per (provider, providerCallId): a redelivered webhook
   * returns the existing call instead of creating a second one.
   */
  async admitInboundCall(input: {
    organizationId: string;
    provider: string;
    providerCallId: string;
    fromNumber: string;
    toNumber: string;
    voiceNumberId?: string | null;
    isSimulation?: boolean;
  }): Promise<AdmissionDecision> {
    const existing = await prisma.call.findUnique({
      where: { provider_providerCallId: { provider: input.provider, providerCallId: input.providerCallId } },
    });
    if (existing) {
      if (isTerminal(existing.status as CallStatus)) {
        return { admitted: false, reason: "CALL_ALREADY_ENDED", spokenMessage: "" };
      }
      return { admitted: true, callId: existing.id, streamToken: this.streamTokens.issue(existing.id) };
    }

    const settings = await this.settings.getOrCreate(input.organizationId);

    const moduleEnabled = await this.entitlements.isEnabled(input.organizationId, VOICE_CAPABILITIES.AI_VOICE_MODULE);
    if (!moduleEnabled) {
      return { admitted: false, reason: "ENTITLEMENT_DISABLED", spokenMessage: "الخدمة غير متاحة حالياً. شكراً لاتصالك." };
    }
    if (settings.killSwitchEnabled) {
      return {
        admitted: false,
        reason: "KILL_SWITCH",
        spokenMessage: "خدمة الرد الآلي متوقفة مؤقتاً. فريقنا راح يتواصل معك. شكراً لاتصالك.",
      };
    }

    const concurrent = await this.usage.concurrentCallCount(input.organizationId);
    if (concurrent >= settings.maxConcurrentCalls) {
      return {
        admitted: false,
        reason: "CONCURRENCY_LIMIT",
        spokenMessage: "كل الخطوط مشغولة الآن. نعتذر منك، حاول بعد قليل.",
      };
    }

    const budget = await this.usage.isOverBudget(input.organizationId);
    if (budget.blocked) {
      await this.usage.notifyBudgetBlock(input.organizationId, budget.scope ?? "UNKNOWN");
      return {
        admitted: false,
        reason: `BUDGET_${budget.scope}`,
        spokenMessage: "الخدمة غير متاحة حالياً. فريقنا راح يتواصل معك. شكراً لاتصالك.",
      };
    }

    const agent = await prisma.voiceAgent.findFirst({
      where: { organizationId: input.organizationId, status: "ACTIVE", deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    if (!agent) {
      return {
        admitted: false,
        reason: "NO_ACTIVE_AGENT",
        spokenMessage: "الخدمة غير مفعّلة حالياً. شكراً لاتصالك.",
      };
    }

    const caller = await this.identity.resolve(input.organizationId, input.fromNumber, { createIfMissing: true });

    const call = await prisma.call.create({
      data: {
        organizationId: input.organizationId,
        provider: input.provider,
        providerCallId: input.providerCallId,
        direction: "INBOUND",
        voiceAgentId: agent.id,
        voiceAgentVersion: agent.activeVersion,
        promptVersion: agent.promptVersion,
        voiceNumberId: input.voiceNumberId ?? null,
        contactId: caller.contactId,
        leadId: caller.leadId,
        productId: caller.productId,
        campaignId: caller.campaignId,
        fromNumber: input.fromNumber,
        toNumber: input.toNumber,
        normalizedFromPhone: normalizePhoneStrict(input.fromNumber).normalized || normalizePhone(input.fromNumber),
        language: agent.primaryLanguage,
        status: "RINGING",
        recordingEnabled: agent.recordingEnabled && settings.recordingEnabled,
        isSimulation: input.isSimulation === true,
        correlationId: generateCorrelationId(),
      },
    });

    await this.recordEvent(call.id, "CALL_RECEIVED", null, "RINGING", {
      from: input.fromNumber,
      isKnownCustomer: caller.isKnownCustomer,
    });

    return {
      admitted: true,
      callId: call.id,
      streamToken: this.streamTokens.issue(call.id),
      greeting: agent.greetingMessage ?? undefined,
    };
  }

  // ------------------------------------------------------------ media session

  /**
   * Called when the telephony media socket connects. Starts the realtime AI
   * session and bridges audio in both directions.
   */
  async startMediaSession(
    callId: string,
    hooks: { sendAudioToCaller: (audioBase64: string) => void; closeTelephony: () => void }
  ): Promise<boolean> {
    const call = await prisma.call.findUnique({ where: { id: callId }, include: { agent: true } });
    if (!call || !call.agent || isTerminal(call.status as CallStatus)) return false;

    const session = new CallSession(call.id, call.organizationId, call.correlationId);
    session.sendAudioToCaller = hooks.sendAudioToCaller;
    session.closeTelephony = hooks.closeTelephony;
    this.sessions.set(callId, session);

    await this.transition(session, "CONNECTING");
    await this.transition(session, "AI_SESSION_STARTING");

    try {
      const instructions = await this.buildInstructions(call, call.agent);
      const allowedTools = call.agent.allowedTools ?? [];

      const realtime = await this.realtimeProvider.createSession({
        instructions,
        voice: call.agent.voiceId,
        // Telephony-native codec: no transcoding in either direction.
        audioFormat: "g711_ulaw",
        tools: this.tools.toolDefinitionsFor(allowedTools),
        temperature: 0.7,
        turnDetection: { silenceDurationMs: 600, threshold: 0.5 },
        language: call.agent.primaryLanguage,
      });

      session.realtime = realtime;
      realtime.onEvent((event) => {
        void this.handleRealtimeEvent(session, call.id, event);
      });

      await prisma.call.update({ where: { id: call.id }, data: { answeredAt: new Date() } });
      session.answeredAt = Date.now();
      await this.transition(session, "ACTIVE");

      // The model opens the conversation so the caller is never met by silence.
      realtime.requestResponse();

      this.startPolicyTimers(session, call.agent.maxCallSeconds);
      return true;
    } catch (error: any) {
      this.logger.error(`Realtime session failed for call ${callId}: ${String(error?.message).slice(0, 200)}`);
      await this.failSafeEnd(session, call.agent.employeeName, "REALTIME_UNAVAILABLE");
      return false;
    }
  }

  /** Caller audio frame arriving from the telephony socket. */
  pushCallerAudio(callId: string, audioBase64: string): void {
    const session = this.sessions.get(callId);
    if (!session?.realtime?.isOpen()) return;
    session.lastCallerAudioAt = Date.now();
    session.silenceStage = 0;
    session.realtime.sendAudio(audioBase64);
  }

  async endCall(callId: string, reason: string, status: CallStatus = "COMPLETED"): Promise<void> {
    const session = this.sessions.get(callId);
    if (session) {
      if (session.ending) return;
      session.ending = true;
      session.clearTimers();
      await this.transition(session, "ENDING").catch(() => undefined);
      await session.realtime?.close().catch(() => undefined);
      try {
        session.closeTelephony?.();
      } catch {
        // socket may already be gone
      }
      this.sessions.delete(callId);
    }

    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call || isTerminal(call.status as CallStatus)) return;

    const durationSeconds = session ? session.durationSeconds() : Math.max(0, Math.round((Date.now() - call.startedAt.getTime()) / 1000));

    await prisma.call.update({
      where: { id: callId },
      data: { status, endReason: reason.slice(0, 200), endedAt: new Date(), durationSeconds },
    });
    await this.recordEvent(callId, "CALL_ENDED", call.status, status, { reason });

    // Post-call work must never break the call record if it fails.
    await this.finalizeCall(callId, session, durationSeconds).catch((error) =>
      this.logger.error(`Post-call processing failed for ${callId}: ${String(error?.message).slice(0, 200)}`)
    );
  }

  activeCallCount(): number {
    return this.sessions.size;
  }

  // ------------------------------------------------------------------ internals

  private async handleRealtimeEvent(session: CallSession, callId: string, event: RealtimeEvent): Promise<void> {
    try {
      switch (event.type) {
        case "audio_delta":
          session.sendAudioToCaller?.(event.audioBase64);
          // 8 kHz mulaw: 1 byte per sample, so base64 length maps to duration.
          session.aiAudioMs += Math.round((event.audioBase64.length * 0.75) / 8);
          if (session.status !== "SPEAKING") await this.transition(session, "SPEAKING");
          break;

        case "speech_started":
          // Barge-in: the caller started talking, so stop generating at once.
          session.realtime?.cancelSpeech();
          await this.transition(session, "LISTENING");
          break;

        case "user_transcript":
          await this.appendTranscript(session, callId, "CUSTOMER", event.text);
          this.trackRepetition(session, event.text);
          await this.transition(session, "THINKING");
          break;

        case "assistant_transcript":
          await this.appendTranscript(session, callId, "AGENT", event.text);
          break;

        case "tool_call":
          await this.handleToolCall(session, callId, event.callId, event.name, event.argumentsJson);
          break;

        case "response_done":
          if (!isTerminal(session.status)) await this.transition(session, "LISTENING");
          break;

        case "error":
          if (event.fatal) {
            const agentName = await this.employeeName(callId);
            await this.failSafeEnd(session, agentName, "REALTIME_ERROR");
          }
          break;

        case "closed":
          if (!session.ending) await this.endCall(callId, "REALTIME_CLOSED", "DISCONNECTED");
          break;

        default:
          break;
      }
    } catch (error: any) {
      this.logger.error(`Realtime event handling failed on ${callId}: ${String(error?.message).slice(0, 200)}`);
    }
  }

  private async handleToolCall(
    session: CallSession,
    callId: string,
    toolCallId: string,
    toolName: string,
    argumentsJson: string
  ): Promise<void> {
    await this.transition(session, "TOOL_EXECUTION");
    session.toolCallCount++;

    const call = await prisma.call.findUnique({ where: { id: callId }, include: { agent: true } });
    if (!call?.agent) return;

    const settings = await this.settings.getOrCreate(call.organizationId);
    const verifiedScopes = await this.verification.verifiedScopes(callId);

    const result = await this.tools.execute(
      {
        callId,
        organizationId: call.organizationId,
        agentRole: call.agent.role,
        agentAllowedTools: call.agent.allowedTools ?? [],
        contactId: call.contactId,
        leadId: call.leadId,
        callerPhone: call.fromNumber,
        toolsEnabledForOrg: settings.toolsEnabled,
        otpAvailable: this.settings.isOtpAvailable(settings),
        verifiedScopes,
      },
      toolName,
      argumentsJson
    );

    if (result.ok) {
      session.consecutiveToolFailures = 0;
      if (toolName === "sendWhatsAppFollowup") session.followupCount++;
    } else {
      session.consecutiveToolFailures++;
    }

    session.realtime?.sendToolResult(toolCallId, JSON.stringify(result));

    // Loop detection: repeated tool failure means we stop trying and hand off.
    if (session.consecutiveToolFailures >= settings.maxRepeatedFailures) {
      session.realtime?.sendSystemMessage(
        "تعذر تنفيذ العمليات عدة مرات. اعتذر للعميل باختصار، واعرض تسجيل طلبه ليتواصل معه الفريق، ثم اختم المكالمة."
      );
      await this.recordEvent(callId, "TOOL_FAILURE_LOOP", null, null, { failures: session.consecutiveToolFailures });
      session.consecutiveToolFailures = 0;
    }
  }

  /** Staged silence policy: wait → gentle probe → final notice → end. */
  private startPolicyTimers(session: CallSession, maxCallSeconds: number) {
    const timer = setInterval(() => {
      void (async () => {
        try {
          if (session.ending || !this.sessions.has(session.callId)) return;
          const settings = await this.settings.getOrCreate(session.organizationId);
          const idleSeconds = (Date.now() - session.lastCallerAudioAt) / 1000;
          const elapsedSeconds = session.durationSeconds();

          if (elapsedSeconds >= maxCallSeconds) {
            await this.endCall(session.callId, "MAX_DURATION_REACHED");
            return;
          }
          // Give the model a chance to wrap up naturally before the hard stop.
          if (!session.wrapUpNoticeSent && elapsedSeconds >= Math.max(30, maxCallSeconds - 45)) {
            session.wrapUpNoticeSent = true;
            session.realtime?.sendSystemMessage(buildWrapUpNotice());
            session.realtime?.requestResponse();
            return;
          }

          if (session.silenceStage === 0 && idleSeconds >= settings.silenceWarningSeconds) {
            session.silenceStage = 1;
            session.realtime?.sendSystemMessage(`قل بالضبط: "${buildSilenceProbeMessage(1)}"`);
            session.realtime?.requestResponse();
          } else if (session.silenceStage === 1 && idleSeconds >= settings.silenceEndSeconds) {
            session.silenceStage = 2;
            session.realtime?.sendSystemMessage(`قل بالضبط: "${buildSilenceProbeMessage(2)}"`);
            session.realtime?.requestResponse();
            const closeTimer = setTimeout(() => {
              void this.endCall(session.callId, "SILENCE_TIMEOUT");
            }, 6000);
            session.addTimer(closeTimer as unknown as NodeJS.Timeout);
          }
        } catch (error: any) {
          this.logger.warn(`Policy tick failed for ${session.callId}: ${String(error?.message).slice(0, 150)}`);
        }
      })();
    }, 2000);
    session.addTimer(timer);
  }

  private trackRepetition(session: CallSession, text: string) {
    const normalized = text.trim().toLowerCase();
    if (normalized && normalized === session.lastUserUtterance) {
      session.repeatedQuestionCount++;
      if (session.repeatedQuestionCount === 3) {
        session.realtime?.sendSystemMessage(
          "العميل كرر نفس السؤال عدة مرات، ما يبدو أن إجابتك وصلت. غيّر أسلوب الشرح أو اعرض تحويله للفريق البشري."
        );
      }
    } else {
      session.repeatedQuestionCount = 0;
      session.lastUserUtterance = normalized;
    }
  }

  /** Never leave the caller in silence when the model layer dies. */
  private async failSafeEnd(session: CallSession, employeeName: string, reason: string) {
    try {
      await this.recordEvent(session.callId, "FAILSAFE_TRIGGERED", null, null, {
        reason,
        // The spoken fallback is recorded so support knows what the caller heard.
        message: buildFailsafeMessage(employeeName, "QanoAI"),
      });
    } catch {
      // recording the event must not block the shutdown path
    }
    await this.endCall(session.callId, reason, "FAILED");
  }

  private async appendTranscript(session: CallSession, callId: string, speaker: string, text: string) {
    const clean = String(text ?? "").trim();
    if (!clean) return;
    session.transcript.push({ speaker, text: clean });

    const redacted = this.redactPii(clean);
    await prisma.callTranscriptTurn
      .create({
        data: {
          callId,
          turnIndex: session.turnIndex++,
          speaker,
          text: clean,
          redactedText: redacted.changed ? redacted.text : null,
          containsPii: redacted.changed,
          startOffsetMs: Date.now() - session.startedAt,
        },
      })
      .catch(() => undefined);
  }

  /** Masks obvious secrets so they never reach summaries or logs. */
  private redactPii(text: string): { text: string; changed: boolean } {
    let changed = false;
    let output = text.replace(/\b\d{4,8}\b(?=\s*(?:هو\s*)?(?:رمز|كود|otp))/gi, () => {
      changed = true;
      return "[محجوب]";
    });
    output = output.replace(/(?:رمز|كود|otp)\s*(?:التحقق)?\s*(?:هو)?\s*[:\-]?\s*(\d{4,8})/gi, (m) => {
      changed = true;
      return m.replace(/\d{4,8}/, "[محجوب]");
    });
    output = output.replace(/\b\d{10}\b/g, (m) => {
      changed = true;
      return `${m.slice(0, 3)}****${m.slice(-2)}`;
    });
    return { text: output, changed };
  }

  private async buildInstructions(call: any, agent: any): Promise<string> {
    const caller = {
      isKnownCustomer: Boolean(call.contactId || call.leadId),
      contactName: null as string | null,
      businessName: null as string | null,
      previousInterest: null as string | null,
      campaignName: null as string | null,
      leadStatus: null as string | null,
    };

    if (call.contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: call.contactId },
        select: { name: true, company: true },
      });
      caller.contactName = contact?.name ?? null;
      caller.businessName = contact?.company ?? null;
    }
    if (call.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: call.leadId }, select: { status: true, businessName: true } });
      caller.leadStatus = lead?.status ?? null;
      caller.businessName = caller.businessName ?? lead?.businessName ?? null;
    }
    if (call.campaignId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: call.campaignId }, select: { name: true } });
      caller.campaignName = campaign?.name ?? null;
    }

    // Load the catalog the agent may quote. Prices come from here only.
    const products = await prisma.salesProduct.findMany({
      where: { organizationId: call.organizationId, deletedAt: null, active: true, aiSalesEnabled: true },
      take: 8,
      orderBy: { createdAt: "asc" },
    });
    if (call.productId) {
      const preferred = products.findIndex((p) => p.id === call.productId);
      if (preferred > 0) products.unshift(...products.splice(preferred, 1));
    }

    const productContexts: VoiceProductContext[] = products.map((p) => ({
      nameArabic: p.nameArabic,
      shortDescription: p.shortDescription,
      priceFormatted: formatSarMinor(p.priceMinor),
      features: this.asStrings(p.features),
      benefits: this.asStrings(p.benefits),
      faqs: Array.isArray(p.faqs) ? (p.faqs as any[]).slice(0, 8) : [],
      objectionGuidance: Array.isArray(p.objectionGuidance) ? (p.objectionGuidance as any[]).slice(0, 8) : [],
      maxDiscountPercent: Math.min(p.maxDiscountPercent, 5),
      trustedUrls: [
        p.purchaseUrl ? { label: "رابط الشراء", url: p.purchaseUrl } : null,
        p.storeUrl ? { label: "المتجر", url: p.storeUrl } : null,
        p.demoUrl ? { label: "عرض تجريبي", url: p.demoUrl } : null,
        p.productPageUrl ? { label: "صفحة البرنامج", url: p.productPageUrl } : null,
      ].filter(Boolean) as Array<{ label: string; url: string }>,
    }));

    const settings = await this.settings.getOrCreate(call.organizationId);

    return buildVoiceSalesInstructions({
      persona: {
        employeeName: agent.employeeName,
        companyName: "QanoAI",
        role: agent.role,
        primaryLanguage: agent.primaryLanguage,
        salesStyle: agent.salesStyle,
        tone: agent.tone,
        formality: agent.formality,
        saudiDialect: agent.saudiDialect,
        greetingMessage: agent.greetingMessage,
        closingMessage: agent.closingMessage,
        businessHoursNote: settings.businessHoursNote,
      },
      products: productContexts,
      caller,
      knowledgeContext: null,
      toolsEnabled: settings.toolsEnabled && (agent.allowedTools ?? []).length > 0,
    });
  }

  private async finalizeCall(callId: string, session: CallSession | undefined, durationSeconds: number) {
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) return;

    const turns =
      session?.transcript.length
        ? session.transcript
        : (
            await prisma.callTranscriptTurn.findMany({
              where: { callId },
              orderBy: { turnIndex: "asc" },
              select: { speaker: true, text: true },
            })
          ).map((t) => ({ speaker: t.speaker, text: t.text }));

    const realtimeUsage = session?.realtime?.getUsage();
    const estimated = await this.usage.record(
      call.organizationId,
      callId,
      {
        telephonySeconds: durationSeconds,
        aiAudioSeconds: Math.round((session?.aiAudioMs ?? 0) / 1000),
        aiInputTokens: realtimeUsage?.inputTokens ?? 0,
        aiOutputTokens: realtimeUsage?.outputTokens ?? 0,
        toolCallCount: session?.toolCallCount ?? 0,
        followupCount: session?.followupCount ?? 0,
      }
    );
    await prisma.call.update({ where: { id: callId }, data: { estimatedCostMinor: estimated } });

    if (turns.length === 0) return; // nothing was said; a summary would be invented

    const productNames = call.productId
      ? [(await prisma.salesProduct.findUnique({ where: { id: call.productId }, select: { nameArabic: true } }))?.nameArabic ?? ""]
      : [];

    const summary = await summarizeCall({ transcript: turns, productNames: productNames.filter(Boolean) });
    if (!summary.ok || !summary.data) {
      await this.recordEvent(callId, "SUMMARY_FAILED", null, null, { error: summary.error });
      return;
    }

    await prisma.call.update({
      where: { id: callId },
      data: {
        summary: summary.data.summary,
        structuredSummary: summary.data as any,
        salesOutcome: summary.data.outcome,
        supportRequired: call.supportRequired || summary.data.supportRequired,
      },
    });

    if (call.leadId) {
      const leadStatus = this.leadStatusForOutcome(summary.data.outcome);
      if (leadStatus) {
        await this.leads.transition(call.leadId, leadStatus, `voice:${summary.data.outcome}`, "VOICE").catch(() => undefined);
      }
    }

    const isHot = summary.data.outcome === "HOT" || summary.data.outcome === "READY_TO_BUY";
    if (isHot && call.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: call.leadId } });
      const product = call.productId
        ? await prisma.salesProduct.findUnique({ where: { id: call.productId } })
        : null;
      if (lead) {
        await this.hotLead
          .notifyIfNeeded({
            organizationId: call.organizationId,
            leadId: lead.id,
            campaignId: call.campaignId,
            conversationId: null,
            productName: product?.nameArabic ?? "غير محدد",
            priceMinor: product?.priceMinor ?? 0,
            businessName: lead.businessName,
            businessType: lead.businessType,
            lastMessage: `مكالمة صوتية: ${summary.data.summary.slice(0, 150)}`,
          })
          .catch(() => undefined);
      }
    }

    await this.audit
      .log({
        organizationId: call.organizationId,
        action: "VOICE_CALL_COMPLETED",
        resourceType: "Call",
        resourceId: callId,
        metadata: {
          outcome: summary.data.outcome,
          durationSeconds,
          supportRequired: summary.data.supportRequired,
          promptVersion: call.promptVersion ?? VOICE_SALES_PROMPT_VERSION,
        },
        correlationId: call.correlationId,
      })
      .catch(() => undefined);
  }

  private leadStatusForOutcome(outcome: string): string | null {
    switch (outcome) {
      case "READY_TO_BUY":
        return "READY_TO_BUY";
      case "HOT":
        return "HOT";
      case "INTERESTED":
        return "INTERESTED";
      case "NOT_INTERESTED":
        return "NOT_INTERESTED";
      case "CUSTOM_SOFTWARE_REQUEST":
        return "CUSTOM_SOFTWARE_REQUEST";
      case "SUPPORT_REQUIRED":
        return "HANDED_TO_SUPPORT";
      default:
        return null;
    }
  }

  private async employeeName(callId: string): Promise<string> {
    const call = await prisma.call.findUnique({ where: { id: callId }, include: { agent: true } });
    return call?.agent?.employeeName ?? "المساعد";
  }

  private async transition(session: CallSession, to: CallStatus): Promise<void> {
    const from = session.status;
    if (from === to) return;
    if (!canTransition(from, to)) {
      // Rejected rather than silently applied, so state can never drift.
      this.logger.warn(`Ignored invalid transition ${from}->${to} on call ${session.callId}`);
      return;
    }
    session.status = to;
    await prisma.call.update({ where: { id: session.callId }, data: { status: to } }).catch(() => undefined);
    await this.recordEvent(session.callId, "STATE_CHANGE", from, to);
  }

  private async recordEvent(
    callId: string,
    eventType: string,
    fromStatus: string | null = null,
    toStatus: string | null = null,
    metadata?: Record<string, unknown>
  ) {
    await prisma.callEvent
      .create({ data: { callId, eventType, fromStatus, toStatus, metadata: metadata as any } })
      .catch(() => undefined);
  }

  private asStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  }
}
