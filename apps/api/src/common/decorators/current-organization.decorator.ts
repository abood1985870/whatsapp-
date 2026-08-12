import { createParamDecorator, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { resolveMembership } from "../guards/resolve-membership";

/**
 * The organization this request is acting on, taken from the caller's verified
 * membership rather than from anything the client sent.
 *
 * Prefer this over `@Query("organizationId")` and `@Body() dto.organizationId`.
 * A handler that reads the id from the request is trusting the client with the
 * tenant boundary; a handler that reads it from here cannot be pointed at
 * another organization no matter what the caller sends.
 */
export const CurrentOrganization = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const membership = request.membership ?? resolveMembership(request);
  if (!membership?.organizationId) throw new ForbiddenException("ORGANIZATION_ACCESS_DENIED");
  return membership.organizationId as string;
});
