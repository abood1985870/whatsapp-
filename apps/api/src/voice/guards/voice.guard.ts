import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { VOICE_CAPABILITIES } from "@qanoai/permissions";
import { MarketingEntitlementsService } from "../../marketing/entitlements.service";

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

    const orgId =
      request.params?.organizationId || request.body?.organizationId || request.query?.organizationId;
    const activeMemberships = (user.memberships || []).filter((m: any) => m.status === "ACTIVE");
    const membership = orgId
      ? activeMemberships.find((m: any) => m.organizationId === orgId)
      : activeMemberships[0];

    if (!membership) throw new ForbiddenException("VOICE_MODULE_DISABLED");
    request.membership = membership;

    const enabled = await this.entitlements.isEnabled(
      membership.organizationId,
      VOICE_CAPABILITIES.AI_VOICE_MODULE
    );
    if (!enabled) throw new ForbiddenException("VOICE_MODULE_DISABLED");

    return true;
  }
}
