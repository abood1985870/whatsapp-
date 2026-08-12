import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, normalizePhoneStrict } from "@qanoai/shared";
import { config } from "@qanoai/config";
import { AuditService } from "../audit/audit.service";
import { VoiceProviderRegistry } from "./voice-provider.registry";
import { VoiceSettingsService } from "./voice-settings.service";

const CONNECTION_TYPES = ["EXISTING_FORWARDING", "EXISTING_SIP", "NEW_PROVIDER_NUMBER"];

/**
 * Number management. A number is NEVER shown as connected because someone
 * saved a form: it stays PENDING_SETUP until a real inbound call arrives on
 * it (the webhook flips it to READY).
 */
@Injectable()
export class VoiceNumbersService {
  constructor(
    private readonly audit: AuditService,
    private readonly registry: VoiceProviderRegistry,
    private readonly settings: VoiceSettingsService
  ) {}

  async list(organizationId: string) {
    return prisma.voiceNumber.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Setup instructions are provider- and route-specific, never generic filler. */
  async registerExisting(
    organizationId: string,
    dto: { phoneNumber: string; connectionType: string; voiceAgentId?: string },
    actorUserId: string
  ) {
    const { normalized, valid } = normalizePhoneStrict(dto.phoneNumber);
    if (!valid) throw new BadRequestException("INVALID_PHONE");
    if (!CONNECTION_TYPES.includes(dto.connectionType)) throw new BadRequestException("INVALID_CONNECTION_TYPE");

    const provider = await this.registry.forOrganization(organizationId);
    const capabilities = provider.getCapabilities();
    if (!capabilities.includes("EXISTING_NUMBER")) {
      throw new BadRequestException("PROVIDER_DOES_NOT_SUPPORT_EXISTING_NUMBER");
    }

    const existing = await prisma.voiceNumber.findUnique({
      where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: normalized } },
    });
    if (existing && !existing.deletedAt) throw new BadRequestException("NUMBER_ALREADY_REGISTERED");

    const number = await prisma.voiceNumber.create({
      data: {
        organizationId,
        voiceAgentId: dto.voiceAgentId ?? null,
        phoneNumber: dto.phoneNumber,
        normalizedPhone: normalized,
        provider: provider.id,
        connectionType: dto.connectionType,
        status: "PENDING_SETUP",
        capabilities,
        setupNotes: this.setupInstructions(dto.connectionType),
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_NUMBER_ADDED",
      resourceType: "VoiceNumber",
      resourceId: number.id,
      metadata: { connectionType: dto.connectionType, provider: provider.id },
      correlationId: generateCorrelationId(),
    });
    return number;
  }

  async listAvailable(organizationId: string, countryCode: string) {
    const provider = await this.registry.forOrganization(organizationId);
    if (!provider.getCapabilities().includes("NEW_NUMBER")) {
      return { supported: false, reason: "PROVIDER_DOES_NOT_SUPPORT_NEW_NUMBER", numbers: [] };
    }
    const health = await provider.getHealth();
    if (health.status !== "LIVE_VERIFIED") {
      return { supported: false, reason: health.status, detail: health.detail, numbers: [] };
    }
    return { supported: true, numbers: await provider.listAvailableNumbers(countryCode) };
  }

  /**
   * Buying a number spends the owner's money, so it requires an explicit
   * opt-in flag in settings on top of the normal permission check. The
   * software never provisions on its own.
   */
  async provision(organizationId: string, phoneNumber: string, actorUserId: string) {
    const settings = await this.settings.getOrCreate(organizationId);
    if (!settings.numberProvisioningEnabled) {
      throw new ForbiddenException("NUMBER_PROVISIONING_DISABLED");
    }

    const provider = await this.registry.forOrganization(organizationId);
    if (!provider.getCapabilities().includes("NEW_NUMBER")) {
      throw new BadRequestException("PROVIDER_DOES_NOT_SUPPORT_NEW_NUMBER");
    }

    const { normalized, valid } = normalizePhoneStrict(phoneNumber);
    if (!valid) throw new BadRequestException("INVALID_PHONE");

    const { providerNumberId } = await provider.provisionNumber(phoneNumber);
    const number = await prisma.voiceNumber.create({
      data: {
        organizationId,
        phoneNumber,
        normalizedPhone: normalized,
        provider: provider.id,
        providerNumberId,
        connectionType: "NEW_PROVIDER_NUMBER",
        status: "PENDING_SETUP",
        capabilities: provider.getCapabilities(),
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_NUMBER_PROVISIONED",
      resourceType: "VoiceNumber",
      resourceId: number.id,
      metadata: { provider: provider.id },
      correlationId: generateCorrelationId(),
    });
    return number;
  }

  async remove(organizationId: string, id: string, actorUserId: string) {
    const number = await prisma.voiceNumber.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!number) throw new NotFoundException("VOICE_NUMBER_NOT_FOUND");

    if (number.providerNumberId) {
      const provider = this.registry.byId(number.provider);
      await provider.releaseNumber(number.providerNumberId).catch(() => undefined);
    }
    const updated = await prisma.voiceNumber.update({
      where: { id: number.id },
      data: { deletedAt: new Date(), status: "NOT_CONFIGURED" },
    });

    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_NUMBER_REMOVED",
      resourceType: "VoiceNumber",
      resourceId: id,
      correlationId: generateCorrelationId(),
    });
    return updated;
  }

  private setupInstructions(connectionType: string): string {
    const base = config.VOICE_PUBLIC_BASE_URL ?? "<عنوان الخادم العام>";
    if (connectionType === "EXISTING_FORWARDING") {
      return [
        "١) اطلب من مشغّل الاتصالات (STC / Mobily / Zain / Salam) تفعيل تحويل المكالمات من رقمك إلى رقم المزوّد.",
        "٢) بعد التحويل، اتصل بالرقم من جوال آخر لاختباره.",
        `٣) تأكد أن رابط الويب هوك في لوحة المزوّد هو: ${base}/v1/voice/webhooks/twilio/incoming`,
        "الحالة تبقى (بانتظار الإعداد) حتى تصل أول مكالمة فعلية.",
      ].join("\n");
    }
    if (connectionType === "EXISTING_SIP") {
      return [
        "١) اطلب من المشغّل أو مزوّد SIP إنهاء رقمك عبر SIP Trunk إلى حساب المزوّد.",
        "٢) فعّل TLS/SRTP إن كان مدعوماً؛ لا تعطّل التشفير لتسهيل التجربة.",
        `٣) وجّه المكالمات الواردة إلى: ${base}/v1/voice/webhooks/twilio/incoming`,
        "الحالة تبقى (بانتظار الإعداد) حتى تصل أول مكالمة فعلية.",
      ].join("\n");
    }
    return [
      "ملاحظة نظامية: الأرقام السعودية (+966) لا تُشترى عبر واجهة المزوّد الدولي لجهة غير مرخّصة محلياً.",
      "الخيار العملي هو استخدام رقمك الحالي عبر التحويل أو SIP.",
    ].join("\n");
  }
}
