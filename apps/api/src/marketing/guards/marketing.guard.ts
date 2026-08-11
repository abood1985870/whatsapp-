import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { MarketingEntitlementsService } from "../entitlements.service";
import { MARKETING_CAPABILITIES } from "@qanoai/permissions";
import { resolveMembership } from "../../common/guards/resolve-membership";

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

    // Delegates to the single tenant resolver rather than reimplementing it.
    //
    // This guard used to carry its own copy of the OLD permissive logic —
    // including the `activeMemberships[0]` fallback that resolve-membership.ts
    // exists to remove. Nest runs class-level guards before route-level ones,
    // so this ran FIRST and wrote request.membership; PermissionGuard then
    // short-circuited on it and never reached the hardened path. Every route in
    // this module was still resolving tenants the old way.
    const membership = resolveMembership(request);

    const enabled = await this.entitlements.isEnabled(
      membership.organizationId,
      MARKETING_CAPABILITIES.AI_SALES_MODULE
    );
    if (!enabled) throw new ForbiddenException("MARKETING_MODULE_DISABLED");

    return true;
  }
}
