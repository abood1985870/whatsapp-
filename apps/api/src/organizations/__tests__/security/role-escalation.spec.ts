const findUnique = jest.fn();
const findMany = jest.fn();
const updateMany = jest.fn();
const membershipFindUnique = jest.fn();
const roleCreate = jest.fn();

jest.mock("@qanoai/database", () => ({
  prisma: {
    role: {
      findUnique: (...a: any[]) => findUnique(...a),
      findMany: (...a: any[]) => findMany(...a),
      create: (...a: any[]) => roleCreate(...a),
    },
    membership: {
      updateMany: (...a: any[]) => updateMany(...a),
      findUnique: (...a: any[]) => membershipFindUnique(...a),
    },
    rolePermission: { createMany: jest.fn() },
  },
}));

import { OrganizationsService } from "../../organizations.service";

/**
 * The platform-owner escalation.
 *
 * PLATFORM_SUPER_ADMIN is a global system role, and role names are unique only
 * per organization. Before this change `updateMemberRole` wrote `dto.roleId`
 * onto the membership with no validation, and `listRoles` returned every system
 * role — so an organization admin could read the platform role's id and grant
 * it to themselves, gaining every other tenant's data.
 *
 * It was unreachable in practice only because `members.update` and
 * `roles.manage` had never been seeded. Seeding them is part of the same
 * commit, which is exactly why these tests exist.
 */
describe("role assignment cannot escalate to platform owner", () => {
  const ORG = "org-1";
  let service: OrganizationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrganizationsService();
    updateMany.mockResolvedValue({ count: 1 });
    membershipFindUnique.mockResolvedValue({ id: "m-1" });
  });

  it("refuses to assign the global platform role", async () => {
    findUnique.mockResolvedValue({
      id: "role-platform",
      name: "PLATFORM_SUPER_ADMIN",
      isSystem: true,
      organizationId: null,
    });

    await expect(
      service.updateMemberRole(ORG, "m-1", { roleId: "role-platform" })
    ).rejects.toThrow("ROLE_NOT_ASSIGNABLE");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("refuses to assign a role belonging to another organization", async () => {
    findUnique.mockResolvedValue({
      id: "role-foreign",
      name: "CUSTOM",
      isSystem: false,
      organizationId: "org-2",
    });

    await expect(
      service.updateMemberRole(ORG, "m-1", { roleId: "role-foreign" })
    ).rejects.toThrow("ROLE_NOT_ASSIGNABLE");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("refuses an unknown role id", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.updateMemberRole(ORG, "m-1", { roleId: "nope" })
    ).rejects.toThrow("ROLE_NOT_FOUND");
  });

  it("still allows the organization's own role", async () => {
    findUnique.mockResolvedValue({
      id: "role-own",
      name: "فريق المبيعات",
      isSystem: false,
      organizationId: ORG,
    });

    await service.updateMemberRole(ORG, "m-1", { roleId: "role-own" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "m-1", organizationId: ORG },
      data: { roleId: "role-own" },
    });
  });

  it("still allows a shared tenant-level system role", async () => {
    findUnique.mockResolvedValue({
      id: "role-agent",
      name: "SUPPORT_AGENT",
      isSystem: true,
      organizationId: null,
    });

    await service.updateMemberRole(ORG, "m-1", { roleId: "role-agent" });
    expect(updateMany).toHaveBeenCalled();
  });

  it("does not silently succeed on a membership from another organization", async () => {
    findUnique.mockResolvedValue({
      id: "role-own",
      name: "فريق المبيعات",
      isSystem: false,
      organizationId: ORG,
    });
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateMemberRole(ORG, "m-foreign", { roleId: "role-own" })
    ).rejects.toThrow("MEMBERSHIP_NOT_FOUND");
  });

  it("never lists the platform role among assignable roles", async () => {
    findMany.mockResolvedValue([]);
    await service.listRoles(ORG);

    const where = findMany.mock.calls[0][0].where;
    const systemBranch = where.OR.find((c: any) => c.isSystem === true);
    expect(systemBranch.organizationId).toBeNull();
    expect(systemBranch.name.in).not.toContain("PLATFORM_SUPER_ADMIN");
  });

  it("rejects a tenant role named after the platform role", async () => {
    await expect(
      service.createRole(ORG, { name: "PLATFORM_SUPER_ADMIN" })
    ).rejects.toThrow("ROLE_NAME_RESERVED");
    expect(roleCreate).not.toHaveBeenCalled();
  });

  it("rejects a role with no name", async () => {
    await expect(service.createRole(ORG, { name: "   " })).rejects.toThrow("ROLE_NAME_REQUIRED");
  });
});
