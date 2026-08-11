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
  // Collect EVERY place the client could have put an organization id.
  //
  // Reading them in priority order and returning the first hit created a
  // split-brain: this resolver preferred the body, while ~48 handlers read
  // `@Query("organizationId")` independently. A request carrying one id in the
  // body and a different one in the query string was authorised against the
  // first and executed against the second — a cross-tenant write with no
  // guard violation anywhere.
  //
  // Disagreement is now refused outright. There is no legitimate request that
  // names two different organizations, so this costs nothing and removes the
  // whole class of mismatch rather than one instance of it.
  const candidates = [
    request?.params?.organizationId,
    request?.body?.organizationId,
    request?.query?.organizationId,
    request?.headers?.["x-organization-id"],
  ]
    .filter((v) => typeof v === "string" && v.trim())
    .map((v: string) => v.trim());

  if (candidates.length === 0) return undefined;

  const distinct = new Set(candidates);
  if (distinct.size > 1) {
    throw new BadRequestException("ORGANIZATION_ID_CONFLICT");
  }

  return candidates[0];
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
