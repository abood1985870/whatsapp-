import { BadRequestException, ForbiddenException } from "@nestjs/common";

/**
 * Resolve which organization a request is acting on, and prove the caller
 * belongs to it.
 *
 * The old logic ended in `activeMemberships[0]` — when a request carried no
 * organization id, the guard silently checked the caller's permissions against
 * their FIRST organization and let the request through. Combined with services
 * that query by resource id alone, that is how a member of one organization
 * could read another's data: the permission check passed against their own org,
 * and the query never mentioned an org at all.
 *
 * Three rules now:
 *   1. An organization id in the request must match an ACTIVE membership. No match, no entry.
 *   2. With no id in the request, `X-Organization-Id` is honoured — validated the same way.
 *   3. With nothing at all, a caller who belongs to exactly one organization gets
 *      that one. A caller who belongs to several must say which; guessing on
 *      their behalf is what the bug was.
 *
 * NOTE ON MULTIPART: Nest runs guards before multer parses the body, so
 * `request.body.organizationId` is not visible on file-upload routes. Those
 * requests fall to rule 2 or 3. That is why service-level organization scoping
 * is not optional — the guard cannot be the only boundary.
 */
export function resolveOrganizationId(request: any): string | undefined {
  const fromRequest =
    request?.params?.organizationId ||
    request?.body?.organizationId ||
    request?.query?.organizationId;
  if (fromRequest) return String(fromRequest);

  const header = request?.headers?.["x-organization-id"];
  if (typeof header === "string" && header.trim()) return header.trim();

  return undefined;
}

export function resolveMembership(request: any) {
  if (request.membership) return request.membership;

  const active = (request?.user?.memberships || []).filter((m: any) => m.status === "ACTIVE");
  if (active.length === 0) throw new ForbiddenException("NO_ACTIVE_MEMBERSHIP");

  const organizationId = resolveOrganizationId(request);

  if (organizationId) {
    const membership = active.find((m: any) => m.organizationId === organizationId);
    if (!membership) throw new ForbiddenException("ORGANIZATION_ACCESS_DENIED");
    request.membership = membership;
    return membership;
  }

  if (active.length === 1) {
    request.membership = active[0];
    return active[0];
  }

  // Deliberately a 400, not a silent pick: the caller has to state which
  // organization they mean.
  throw new BadRequestException("ORGANIZATION_REQUIRED");
}
