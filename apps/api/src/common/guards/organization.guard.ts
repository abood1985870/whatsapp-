import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class OrganizationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;
    const orgId = request.params?.organizationId || request.body?.organizationId || request.query?.organizationId;

    if (!orgId) {
      return true;
    }

    const membership = user?.memberships?.find((m: any) => m.organizationId === orgId);
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("ORGANIZATION_ACCESS_DENIED");
    }

    (request as any).membership = membership;
    return true;
  }
}
