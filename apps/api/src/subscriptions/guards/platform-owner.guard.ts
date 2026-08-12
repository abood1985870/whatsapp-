import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Same check as PlatformService.assertPlatformOwner, promoted to a guard so
 * platform-owner-only routes are self-documenting in the decorator chain
 * instead of buried inside a service method — a prior audit flagged the
 * service-only version as easy to forget on a new route.
 */
@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const isPlatformOwner = (user?.memberships || []).some(
      (m: any) =>
        m.status === "ACTIVE" &&
        m.role?.isSystem === true &&
        m.role?.organizationId === null &&
        m.role?.name === "PLATFORM_SUPER_ADMIN"
    );
    if (!isPlatformOwner) throw new ForbiddenException("PLATFORM_OWNER_REQUIRED");
    return true;
  }
}
