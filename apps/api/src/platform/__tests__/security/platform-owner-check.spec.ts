jest.mock("@qanoai/database", () => ({ prisma: {} }));
jest.mock("bcryptjs", () => ({ hash: jest.fn(), compare: jest.fn() }));

import { PlatformService } from "../../platform.service";

/**
 * assertPlatformOwner used to compare only `role.name`. Role names are unique
 * per organization, not globally, so a tenant-created role called
 * PLATFORM_SUPER_ADMIN passed the check and unlocked every organization's data.
 */
describe("assertPlatformOwner", () => {
  const service = new PlatformService();
  // assertPlatformOwner is private; these tests exercise it through a public route.
  const check = (user: any) => (service as any).assertPlatformOwner(user);

  const globalPlatformRole = { name: "PLATFORM_SUPER_ADMIN", isSystem: true, organizationId: null };

  it("accepts the genuine global platform role", () => {
    expect(() => check({ memberships: [{ status: "ACTIVE", role: globalPlatformRole }] })).not.toThrow();
  });

  it("rejects a tenant role that merely shares the name", () => {
    expect(() =>
      check({
        memberships: [
          { status: "ACTIVE", role: { name: "PLATFORM_SUPER_ADMIN", isSystem: false, organizationId: "org-1" } },
        ],
      })
    ).toThrow("PLATFORM_OWNER_REQUIRED");
  });

  it("rejects a tenant role flagged isSystem but scoped to an organization", () => {
    expect(() =>
      check({
        memberships: [
          { status: "ACTIVE", role: { name: "PLATFORM_SUPER_ADMIN", isSystem: true, organizationId: "org-1" } },
        ],
      })
    ).toThrow("PLATFORM_OWNER_REQUIRED");
  });

  it("rejects an inactive membership holding the real role", () => {
    expect(() => check({ memberships: [{ status: "INVITED", role: globalPlatformRole }] })).toThrow(
      "PLATFORM_OWNER_REQUIRED"
    );
  });

  it("rejects an ordinary owner", () => {
    expect(() =>
      check({
        memberships: [
          { status: "ACTIVE", role: { name: "ORGANIZATION_OWNER", isSystem: true, organizationId: null } },
        ],
      })
    ).toThrow("PLATFORM_OWNER_REQUIRED");
  });

  it("rejects a user with no memberships", () => {
    expect(() => check({ memberships: [] })).toThrow("PLATFORM_OWNER_REQUIRED");
    expect(() => check(undefined)).toThrow("PLATFORM_OWNER_REQUIRED");
  });
});
