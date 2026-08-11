import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { VOICE_CAPABILITIES } from "@qanoai/permissions";
import { MarketingEntitlementsService } from "../../marketing/entitlements.service";
import { resolveMembership } from "../../common/guards/resolve-membership";

/**
 * Gate for every voice management route: resolves the caller's ACTIVE
 * membership (same rules as PermissionGuard, which then runs after this)
 * and requires the organization to hold AI_VOICE_MODULE.
 *
 * Entitlements are stored in the shared `entitlements` table, so the
 * marketing entitlements service is reused rather than duplicated.
 */
@Injectable()
export class VoiceGuard implements CanActivate {
  constructor(private readonly entitlements: MarketingEntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException("VOICE_MODULE_DISABLED");

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
      VOICE_CAPABILITIES.AI_VOICE_MODULE
    );
    if (!enabled) throw new ForbiddenException("VOICE_MODULE_DISABLED");

    return true;
  }
}
