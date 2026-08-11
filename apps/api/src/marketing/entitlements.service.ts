import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { MARKETING_CAPABILITIES, MarketingCapability } from "@qanoai/permissions";

@Injectable()
export class MarketingEntitlementsService {
  async isEnabled(organizationId: string, featureKey: MarketingCapability): Promise<boolean> {
    const entitlement = await prisma.entitlement.findUnique({
      where: { organizationId_featureKey: { organizationId, featureKey } },
    });
    return entitlement?.isEnabled === true;
  }

  async listForOrganization(organizationId: string): Promise<Record<string, boolean>> {
    const rows = await prisma.entitlement.findMany({
      where: { organizationId, featureKey: { in: Object.values(MARKETING_CAPABILITIES) } },
    });
    const result: Record<string, boolean> = {};
    for (const key of Object.values(MARKETING_CAPABILITIES)) {
      result[key] = rows.some((r) => r.featureKey === key && r.isEnabled);
    }
    return result;
  }
}
