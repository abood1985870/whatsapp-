import { resolveMembership, resolveOrganizationId } from "../resolve-membership";

/**
 * The tenant boundary at the guard layer.
 *
 * The old implementation ended in `activeMemberships[0]`: a request that named
 * no organization was checked against the caller's first one and allowed
 * through. Paired with services that query by resource id alone, that is the
 * shape of every cross-tenant read in this codebase.
 */
const req = (over: any = {}) => ({
  params: {},
  query: {},
  body: {},
  headers: {},
  user: { memberships: [] },
  ...over,
});

const membership = (organizationId: string, status = "ACTIVE") => ({
  id: `m-${organizationId}`,
  organizationId,
  status,
  role: { permissions: [] },
});

describe("resolveOrganizationId", () => {
  it("prefers the path parameter", () => {
    expect(
      resolveOrganizationId(req({ params: { organizationId: "a" }, query: { organizationId: "b" } }))
    ).toBe("a");
  });

  it("falls back to body then query then header", () => {
    expect(resolveOrganizationId(req({ body: { organizationId: "b" } }))).toBe("b");
    expect(resolveOrganizationId(req({ query: { organizationId: "q" } }))).toBe("q");
    expect(resolveOrganizationId(req({ headers: { "x-organization-id": "h" } }))).toBe("h");
  });

  it("ignores a blank header", () => {
    expect(resolveOrganizationId(req({ headers: { "x-organization-id": "   " } }))).toBeUndefined();
  });
});

describe("resolveMembership", () => {
  it("rejects a caller with no active membership", () => {
    expect(() => resolveMembership(req({ user: { memberships: [membership("a", "INVITED")] } }))).toThrow(
      "NO_ACTIVE_MEMBERSHIP"
    );
  });

  it("rejects an organization the caller does not belong to", () => {
    const r = req({
      params: { organizationId: "other-org" },
      user: { memberships: [membership("my-org")] },
    });
    expect(() => resolveMembership(r)).toThrow("ORGANIZATION_ACCESS_DENIED");
  });

  it("rejects an organization where the membership is not active", () => {
    const r = req({
      params: { organizationId: "old-org" },
      user: { memberships: [membership("old-org", "REMOVED"), membership("my-org")] },
    });
    expect(() => resolveMembership(r)).toThrow("ORGANIZATION_ACCESS_DENIED");
  });

  it("resolves the named organization when the caller belongs to it", () => {
    const r = req({
      params: { organizationId: "org-2" },
      user: { memberships: [membership("org-1"), membership("org-2")] },
    });
    expect(resolveMembership(r).organizationId).toBe("org-2");
    expect(r.membership.organizationId).toBe("org-2");
  });

  it("uses the only membership when the request names none", () => {
    const r = req({ user: { memberships: [membership("solo")] } });
    expect(resolveMembership(r).organizationId).toBe("solo");
  });

  it("REFUSES TO GUESS for a multi-organization caller — this was the hole", () => {
    const r = req({ user: { memberships: [membership("org-1"), membership("org-2")] } });
    expect(() => resolveMembership(r)).toThrow("ORGANIZATION_REQUIRED");
  });

  it("honours X-Organization-Id for a multi-organization caller", () => {
    const r = req({
      headers: { "x-organization-id": "org-2" },
      user: { memberships: [membership("org-1"), membership("org-2")] },
    });
    expect(resolveMembership(r).organizationId).toBe("org-2");
  });

  it("does not let the header name an organization the caller is not in", () => {
    const r = req({
      headers: { "x-organization-id": "org-3" },
      user: { memberships: [membership("org-1"), membership("org-2")] },
    });
    expect(() => resolveMembership(r)).toThrow("ORGANIZATION_ACCESS_DENIED");
  });

  it("reuses an already-resolved membership", () => {
    const existing = membership("cached");
    const r = req({ membership: existing });
    expect(resolveMembership(r)).toBe(existing);
  });
});
