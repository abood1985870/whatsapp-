import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { config } from "@qanoai/config";
import { generateCorrelationId } from "@qanoai/shared";
import { AuditService } from "../audit/audit.service";
import { VoiceProviderRegistry } from "./voice-provider.registry";
import { OpenAiRealtimeProvider } from "./providers/openai-realtime.provider";
import { CallOrchestratorService } from "./call-orchestrator.service";

export type ComponentHealth = "HEALTHY" | "DEGRADED" | "NOT_CONFIGURED" | "UNHEALTHY";

/**
 * Operator-facing diagnostics. Every result comes from a real check;
 * nothing reports healthy because a variable happens to be set. Secrets are
 * never included in the output.
 */
@Injectable()
export class VoiceDiagnosticsService {
  private readonly logger = new Logger(VoiceDiagnosticsService.name);

  /** Provider status vocabulary → operator health vocabulary. */
  private mapProviderStatus(status: string): ComponentHealth {
    switch (status) {
      case "LIVE_VERIFIED":
        return "HEALTHY";
      case "TEST_ONLY":
      case "CONFIGURED_UNVERIFIED":
        return "DEGRADED";
      case "CONFIGURATION_REQUIRED":
        return "NOT_CONFIGURED";
      default:
        return "UNHEALTHY";
    }
  }

  constructor(
    private readonly registry: VoiceProviderRegistry,
    private readonly realtime: OpenAiRealtimeProvider,
    private readonly orchestrator: CallOrchestratorService,
    private readonly audit: AuditService
  ) {}

  async overview(organizationId: string) {
    const provider = await this.registry.forOrganization(organizationId);
    const providerHealth = await provider.getHealth();
    const realtimeConfig = this.realtime.validateConfiguration();

    const [dbOk, numbers, activeAgent, whatsappConnection] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      prisma.voiceNumber.count({ where: { organizationId, deletedAt: null, status: "READY" } }),
      prisma.voiceAgent.findFirst({ where: { organizationId, status: "ACTIVE", deletedAt: null } }),
      prisma.channelConnection.findFirst({ where: { organizationId, deletedAt: null, status: "CONNECTED" } }),
    ]);

    const components: Array<{ name: string; status: ComponentHealth; detail?: string }> = [
      { name: "Database", status: dbOk ? "HEALTHY" : "UNHEALTHY" },
      {
        name: "Telephony provider",
        status: this.mapProviderStatus(providerHealth.status),
        detail: `${provider.id}: ${providerHealth.status}${providerHealth.detail ? ` — ${providerHealth.detail}` : ""}`,
      },
      {
        name: "Realtime AI",
        status: realtimeConfig.configured ? "DEGRADED" : "NOT_CONFIGURED",
        detail: realtimeConfig.configured
          ? "المفتاح موجود؛ شغّل فحص الاتصال للتأكد من الجاهزية"
          : `إعدادات ناقصة: ${realtimeConfig.missing.join(", ")}`,
      },
      {
        name: "Phone numbers",
        status: numbers > 0 ? "HEALTHY" : "NOT_CONFIGURED",
        detail: numbers > 0 ? `${numbers} رقم جاهز` : "لا يوجد رقم تم التحقق منه بمكالمة فعلية",
      },
      {
        name: "Voice agent",
        status: activeAgent ? "HEALTHY" : "NOT_CONFIGURED",
        detail: activeAgent ? activeAgent.employeeName : "لا يوجد موظف صوتي مفعّل",
      },
      {
        name: "WhatsApp followup",
        status: whatsappConnection ? "HEALTHY" : "NOT_CONFIGURED",
        detail: whatsappConnection ? undefined : "لا يوجد اتصال واتساب متصل",
      },
      {
        name: "Recording storage",
        status: config.S3_ENDPOINT && config.S3_ACCESS_KEY_ID ? "DEGRADED" : "NOT_CONFIGURED",
        detail: "تخزين الملفات غير مُنفّذ فعلياً في هذه النسخة؛ التسجيل معطّل",
      },
    ];

    return {
      provider: provider.id,
      providerStatus: providerHealth.status,
      activeCalls: this.orchestrator.activeCallCount(),
      components,
    };
  }

  /** Real API round-trip against the telephony provider. */
  async checkProvider(organizationId: string, actorUserId: string) {
    const provider = await this.registry.forOrganization(organizationId);
    const health = await provider.getHealth();

    await prisma.voiceProviderConfig.upsert({
      where: { organizationId_provider: { organizationId, provider: provider.id } },
      update: {
        status: health.status,
        capabilities: provider.getCapabilities(),
        lastCheckedAt: new Date(),
        lastError: health.status === "ERROR" ? (health.detail ?? "unknown") : null,
      },
      create: {
        organizationId,
        provider: provider.id,
        status: health.status,
        capabilities: provider.getCapabilities(),
        lastCheckedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_PROVIDER_CHECKED",
      resourceType: "VoiceProviderConfig",
      metadata: { provider: provider.id, status: health.status },
      correlationId: generateCorrelationId(),
    });

    return { provider: provider.id, ...health, capabilities: provider.getCapabilities() };
  }

  /**
   * Opens a genuine Realtime session and closes it. This is the only
   * honest way to report the AI layer as verified.
   */
  async checkRealtime(): Promise<{ status: string; detail?: string; latencyMs?: number }> {
    const validation = this.realtime.validateConfiguration();
    if (!validation.configured) {
      return { status: "CONFIGURATION_REQUIRED", detail: `إعدادات ناقصة: ${validation.missing.join(", ")}` };
    }
    const startedAt = Date.now();
    try {
      const session = await this.realtime.createSession({
        instructions: "diagnostic session",
        voice: "alloy",
        audioFormat: "g711_ulaw",
        tools: [],
      });
      const latencyMs = Date.now() - startedAt;
      await session.close();
      return { status: "LIVE_VERIFIED", latencyMs };
    } catch (error: any) {
      return { status: "ERROR", detail: String(error?.message ?? "unknown").slice(0, 200) };
    }
  }
}
