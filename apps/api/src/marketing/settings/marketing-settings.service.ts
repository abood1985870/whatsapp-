import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId, normalizePhoneStrict } from "@qanoai/shared";
import { updateMarketingSettingsSchema } from "@qanoai/validation";
import { AuditService } from "../../audit/audit.service";

@Injectable()
export class MarketingSettingsService {
  constructor(private readonly audit: AuditService) {}

  async getOrCreate(organizationId: string) {
    const existing = await prisma.marketingSettings.findUnique({ where: { organizationId } });
    if (existing) return existing;
    return prisma.marketingSettings.create({ data: { organizationId } });
  }

  async update(dto: unknown, actorUserId: string) {
    const parsed = updateMarketingSettingsSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const { organizationId, ...changes } = parsed.data;

    for (const key of ["testPhoneNumber", "ownerHotLeadPhone"] as const) {
      const value = changes[key];
      if (typeof value === "string" && value.trim() !== "") {
        const { valid, normalized } = normalizePhoneStrict(value);
        if (!valid) throw new BadRequestException(`INVALID_${key.toUpperCase()}`);
        changes[key] = normalized;
      }
    }

    const before = await this.getOrCreate(organizationId);
    const updated = await prisma.marketingSettings.update({
      where: { organizationId },
      data: changes,
    });

    const killSwitchFlipped =
      changes.killSwitchEnabled !== undefined && changes.killSwitchEnabled !== before.killSwitchEnabled;
    await this.audit.log({
      organizationId,
      actorUserId,
      action: killSwitchFlipped
        ? changes.killSwitchEnabled
          ? "MARKETING_KILL_SWITCH_ENABLED"
          : "MARKETING_KILL_SWITCH_DISABLED"
        : "MARKETING_SETTINGS_UPDATED",
      resourceType: "MarketingSettings",
      resourceId: updated.id,
      beforeData: { killSwitchEnabled: before.killSwitchEnabled },
      afterData: { killSwitchEnabled: updated.killSwitchEnabled },
      metadata: { changedKeys: Object.keys(changes) },
      correlationId: generateCorrelationId(),
    });

    return updated;
  }

  async isKillSwitchOn(organizationId: string): Promise<boolean> {
    const settings = await prisma.marketingSettings.findUnique({ where: { organizationId } });
    return settings?.killSwitchEnabled === true;
  }
}
