import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { MarketingEntitlementsService } from "../entitlements.service";
import { MARKETING_CAPABILITIES } from "@qanoai/permissions";

/**
 * Gate for every marketing route: resolves the caller's ACTIVE membership
 * (same resolution rules as PermissionGuard) and requires the organization
 * to hold the AI_SALES_MODULE entitlement. Runs before PermissionGuard so
 * request.membership is populated for the permission check.
 */
@Injectable()
export class MarketingGuard implements CanActivate {
  constructor(private readonly entitlements: MarketingEntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException("MARKETING_MODULE_DISABLED");

    const orgId =
      request.params?.organizationId || request.body?.organizationId || request.query?.organizationId;
    const activeMemberships = (user.memberships || []).filter((m: any) => m.status === "ACTIVE");
    const membership = orgId
      ? activeMemberships.find((m: any) => m.organizationId === orgId)
      : activeMemberships[0];

    if (!membership) throw new ForbiddenException("MARKETING_MODULE_DISABLED");
    request.membership = membership;

    const enabled = await this.entitlements.isEnabled(
      membership.organizationId,
      MARKETING_CAPABILITIES.AI_SALES_MODULE
    );
    if (!enabled) throw new ForbiddenException("MARKETING_MODULE_DISABLED");

    return true;
  }
}
