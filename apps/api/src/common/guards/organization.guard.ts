import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { resolveMembership } from "./resolve-membership";

/**
 * Proves the caller belongs to the organization the request names.
 *
 * Until the `:id` → `:organizationId` rename this guard was a no-op on every
 * route in `organizations.controller.ts`: it read `params.organizationId`,
 * the routes declared `:id`, so `orgId` was always undefined and the guard
 * returned true without checking anything.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    resolveMembership(request);
    return true;
  }
}
