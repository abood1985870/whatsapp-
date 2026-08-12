import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/require-permission.decorator";
import { resolveMembership } from "./resolve-membership";

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

    // Throws rather than falling back to the caller's first organization.
    // See resolve-membership.ts for why that fallback was the tenant boundary's
    // main hole.
    const membership = resolveMembership(request);

    const userPermissions = membership.role?.permissions?.map((p: any) => p.permission.code) || [];
    const hasPermission = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasPermission) {
      throw new ForbiddenException("PERMISSION_DENIED");
    }

    return true;
  }
}
