import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import {
  MARKETING_CAPABILITIES,
  MarketingCapability,
  VOICE_CAPABILITIES,
  VoiceCapability,
} from "@qanoai/permissions";

/** Any add-on module capability stored in the shared `entitlements` table. */
export type ModuleCapability = MarketingCapability | VoiceCapability;

@Injectable()
export class MarketingEntitlementsService {
  async isEnabled(organizationId: string, featureKey: ModuleCapability): Promise<boolean> {
    const entitlement = await prisma.entitlement.findUnique({
      where: { organizationId_featureKey: { organizationId, featureKey } },
    });
    return entitlement?.isEnabled === true;
  }

  async listForOrganization(organizationId: string): Promise<Record<string, boolean>> {
    return this.listKeys(organizationId, Object.values(MARKETING_CAPABILITIES));
  }

  async listVoiceForOrganization(organizationId: string): Promise<Record<string, boolean>> {
    return this.listKeys(organizationId, Object.values(VOICE_CAPABILITIES));
  }

  private async listKeys(organizationId: string, keys: readonly string[]): Promise<Record<string, boolean>> {
    const rows = await prisma.entitlement.findMany({
      where: { organizationId, featureKey: { in: [...keys] } },
    });
    const result: Record<string, boolean> = {};
    for (const key of keys) {
      result[key] = rows.some((r) => r.featureKey === key && r.isEnabled);
    }
    return result;
  }
}
