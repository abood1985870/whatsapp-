import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/require-permission.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    let membership = request.membership;

    // OrganizationGuard populates request.membership, but most routes use
    // PermissionGuard alone (or carry no organizationId at all), so resolve
    // the membership here from the authenticated user when it's missing.
    // Falling back to the user's first active membership when no orgId is in
    // the request means multi-org users are checked against their primary
    // org on resource-scoped routes; per-resource tenant isolation must be
    // enforced by organizationId scoping in the services themselves.
    if (!membership) {
      const user = request.user;
      const orgId = request.params?.organizationId || request.body?.organizationId || request.query?.organizationId;
      const activeMemberships = (user?.memberships || []).filter((m: any) => m.status === "ACTIVE");
      membership = orgId
        ? activeMemberships.find((m: any) => m.organizationId === orgId)
        : activeMemberships[0];
      if (membership) request.membership = membership;
    }

    if (!membership) {
      throw new ForbiddenException("PERMISSION_DENIED");
    }

    const userPermissions = membership.role?.permissions?.map((p: any) => p.permission.code) || [];
    const hasPermission = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasPermission) {
      throw new ForbiddenException("PERMISSION_DENIED");
    }

    return true;
  }
}
