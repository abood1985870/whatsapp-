import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, normalizePhoneStrict } from "@qanoai/shared";
import { config } from "@qanoai/config";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class VoiceSettingsService {
  constructor(private readonly audit: AuditService) {}

  async getOrCreate(organizationId: string) {
    const existing = await prisma.voiceSettings.findUnique({ where: { organizationId } });
    if (existing) return existing;
    return prisma.voiceSettings.create({ data: { organizationId } });
  }

  async isKillSwitchOn(organizationId: string): Promise<boolean> {
    const settings = await prisma.voiceSettings.findUnique({ where: { organizationId } });
    return settings?.killSwitchEnabled === true;
  }

  /** OTP delivery needs an SMS provider; without one, OTP tools are refused. */
  isOtpAvailable(settings: { otpEnabled: boolean }): boolean {
    return settings.otpEnabled === true && Boolean(process.env.VOICE_OTP_PROVIDER);
  }

  async update(organizationId: string, dto: Record<string, any>, actorUserId: string) {
    const before = await this.getOrCreate(organizationId);
    const data: Record<string, any> = {};

    const booleans = [
      "killSwitchEnabled",
      "toolsEnabled",
      "whatsappFollowupEnabled",
      "otpEnabled",
      "numberProvisioningEnabled",
    ];
    for (const key of booleans) {
      if (typeof dto[key] === "boolean") data[key] = dto[key];
    }

    // Recording cannot be switched on while object storage is a stub —
    // enabling it would promise persistence the platform cannot deliver.
    if (typeof dto.recordingEnabled === "boolean") {
      if (dto.recordingEnabled && !this.isStorageConfigured()) {
        throw new BadRequestException("RECORDING_STORAGE_NOT_CONFIGURED");
      }
      data.recordingEnabled = dto.recordingEnabled;
    }

    const numbers: Array<[string, number, number]> = [
      ["maxConcurrentCalls", 1, 100],
      ["maxCallSeconds", 60, 7200],
      ["silenceWarningSeconds", 3, 60],
      ["silenceEndSeconds", 5, 180],
      ["maxRepeatedFailures", 1, 10],
    ];
    for (const [key, min, max] of numbers) {
      if (dto[key] !== undefined && dto[key] !== null) {
        const value = Number(dto[key]);
        if (!Number.isFinite(value) || value < min || value > max) {
          throw new BadRequestException(`INVALID_${key.toUpperCase()}`);
        }
        data[key] = Math.round(value);
      }
    }

    for (const key of ["dailyBudgetMinor", "monthlyBudgetMinor", "transcriptRetentionDays", "recordingRetentionDays"]) {
      if (dto[key] === null) data[key] = null;
      else if (dto[key] !== undefined) {
        const value = Number(dto[key]);
        if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`INVALID_${key.toUpperCase()}`);
        data[key] = Math.round(value);
      }
    }

    for (const key of ["ownerAlertPhone", "testPhoneNumber"]) {
      if (dto[key] === null || dto[key] === "") data[key] = null;
      else if (typeof dto[key] === "string") {
        const { normalized, valid } = normalizePhoneStrict(dto[key]);
        if (!valid) throw new BadRequestException(`INVALID_${key.toUpperCase()}`);
        data[key] = normalized;
      }
    }

    if (typeof dto.businessHoursNote === "string") data.businessHoursNote = dto.businessHoursNote.slice(0, 500);
    if (["TEST", "INTERNAL", "CANARY", "PRODUCTION"].includes(dto.releaseStage)) data.releaseStage = dto.releaseStage;

    const updated = await prisma.voiceSettings.update({ where: { organizationId }, data });

    const killSwitchFlipped =
      data.killSwitchEnabled !== undefined && data.killSwitchEnabled !== before.killSwitchEnabled;
    const recordingFlipped = data.recordingEnabled !== undefined && data.recordingEnabled !== before.recordingEnabled;

    await this.audit.log({
      organizationId,
      actorUserId,
      action: killSwitchFlipped
        ? data.killSwitchEnabled
          ? "VOICE_KILL_SWITCH_ENABLED"
          : "VOICE_KILL_SWITCH_DISABLED"
        : recordingFlipped
          ? data.recordingEnabled
            ? "VOICE_RECORDING_ENABLED"
            : "VOICE_RECORDING_DISABLED"
          : "VOICE_SETTINGS_UPDATED",
      resourceType: "VoiceSettings",
      resourceId: updated.id,
      beforeData: { killSwitchEnabled: before.killSwitchEnabled, recordingEnabled: before.recordingEnabled },
      afterData: { killSwitchEnabled: updated.killSwitchEnabled, recordingEnabled: updated.recordingEnabled },
      metadata: { changedKeys: Object.keys(data) },
      correlationId: generateCorrelationId(),
    });

    return updated;
  }

  private isStorageConfigured(): boolean {
    return Boolean(config.S3_ENDPOINT && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY);
  }
}
