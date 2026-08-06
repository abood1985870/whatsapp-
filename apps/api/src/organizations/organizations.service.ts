import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class OrganizationsService {
  async findByUser(userId: string): Promise<any> {
    const memberships = await prisma.membership.findMany({ where: { userId, status: "ACTIVE" }, include: { organization: true, role: true } });
    return memberships.map((m: any) => ({ ...m.organization, role: m.role, membershipId: m.id }));
  }

  async findOne(id: string): Promise<any> {
    const org = await prisma.organization.findUnique({ where: { id }, include: { memberships: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } }, role: true } }, channelConnections: { where: { deletedAt: null } }, aiAgents: { where: { deletedAt: null } } } });
    if (!org) throw new NotFoundException("ORGANIZATION_NOT_FOUND");
    return org;
  }

  async update(id: string, data: any): Promise<any> {
    return prisma.organization.update({ where: { id }, data: { legalName: data.legalName, displayName: data.displayName, industry: data.industry, timezone: data.timezone, locale: data.locale, currency: data.currency, settings: data.settings } });
  }

  async listMembers(organizationId: string, page: number, limit: number): Promise<any> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.membership.findMany({
        where: { organizationId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } }, role: true },
        skip,
        take: limit,
      }),
      prisma.membership.count({ where: { organizationId } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async inviteMember(organizationId: string, dto: any, invitedById: string): Promise<any> {
    const role = await prisma.role.findFirst({ where: { id: dto.roleId, OR: [{ organizationId }, { isSystem: true }] } });
    if (!role) throw new BadRequestException("INVALID_ROLE");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days valid
    const invitation = await prisma.invitation.create({
      data: {
        email: dto.email,
        organizationId,
        roleId: dto.roleId,
        invitedById,
        expiresAt,
      },
    });
    // Send email via Notification service or Queue will be implemented in Phase 3
    return invitation;
  }

  async updateMemberRole(organizationId: string, membershipId: string, dto: any): Promise<any> {
    return prisma.membership.update({
      where: { id: membershipId, organizationId },
      data: { roleId: dto.roleId },
    });
  }

  async removeMember(organizationId: string, membershipId: string): Promise<any> {
    await prisma.membership.delete({ where: { id: membershipId, organizationId } });
    return { success: true };
  }

  async listRoles(organizationId: string): Promise<any> {
    return prisma.role.findMany({
      where: { OR: [{ organizationId }, { isSystem: true }] },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async createRole(organizationId: string, dto: any): Promise<any> {
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
      },
    });
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: dto.permissionIds.map((pid: string) => ({ roleId: role.id, permissionId: pid })),
      });
    }
    return this.listRoles(organizationId).then(res => res.find((r: any) => r.id === role.id));
  }

  async updateRole(organizationId: string, roleId: string, dto: any): Promise<any> {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.isSystem || role.organizationId !== organizationId) throw new BadRequestException("CANNOT_UPDATE_ROLE");
    
    if (dto.name || dto.description) {
      await prisma.role.update({ where: { id: roleId }, data: { name: dto.name, description: dto.description } });
    }
    
    if (dto.permissionIds) {
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await prisma.rolePermission.createMany({
        data: dto.permissionIds.map((pid: string) => ({ roleId, permissionId: pid })),
      });
    }
    return this.listRoles(organizationId).then(res => res.find((r: any) => r.id === role.id));
  }

  async listBranches(organizationId: string): Promise<any> {
    return prisma.branch.findMany({ where: { organizationId } });
  }

  async createBranch(organizationId: string, dto: any): Promise<any> {
    return prisma.branch.create({
      data: {
        organizationId,
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        location: dto.location,
      },
    });
  }

  async listTeams(organizationId: string): Promise<any> {
    return prisma.team.findMany({ where: { organizationId }, include: { branch: true } });
  }

  async createTeam(organizationId: string, dto: any): Promise<any> {
    return prisma.team.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        branchId: dto.branchId,
      },
    });
  }

  async listRoutingRules(organizationId: string): Promise<any> {
    return prisma.routingRule.findMany({ where: { organizationId }, orderBy: { priority: "desc" } });
  }

  async createRoutingRule(organizationId: string, dto: any): Promise<any> {
    return prisma.routingRule.create({
      data: {
        organizationId,
        name: dto.name,
        condition: dto.condition,
        priority: dto.priority || 0,
        teamId: dto.teamId,
      },
    });
  }

  async listWorkingHours(organizationId: string): Promise<any> {
    return prisma.workingHours.findMany({ where: { organizationId } });
  }

  async setWorkingHours(organizationId: string, dto: any): Promise<any> {
    const teamId = dto.teamId || null;
    await prisma.workingHours.deleteMany({ where: { organizationId, teamId } });
    
    if (dto.hours && Array.isArray(dto.hours)) {
      await prisma.workingHours.createMany({
        data: dto.hours.map((h: any) => ({
          organizationId,
          teamId,
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isActive: h.isActive ?? true,
        })),
      });
    }
    return this.listWorkingHours(organizationId);
  }

  async listHolidays(organizationId: string): Promise<any> {
    return prisma.holiday.findMany({ where: { organizationId }, orderBy: { date: "asc" } });
  }

  async addHoliday(organizationId: string, dto: any): Promise<any> {
    return prisma.holiday.create({
      data: {
        organizationId,
        name: dto.name,
        date: new Date(dto.date),
      },
    });
  }

  async listSlaPolicies(organizationId: string): Promise<any> {
    return prisma.slaPolicy.findMany({ where: { organizationId } });
  }

  async createSlaPolicy(organizationId: string, dto: any): Promise<any> {
    return prisma.slaPolicy.create({
      data: {
        organizationId,
        name: dto.name,
        firstResponseMinutes: dto.firstResponseMinutes,
        nextResponseMinutes: dto.nextResponseMinutes,
        resolutionMinutes: dto.resolutionMinutes,
        warningThreshold: dto.warningThreshold || 0.8,
      },
    });
  }
}
