import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { OrganizationsService } from "./organizations.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Organizations")
@Controller({ path: "organizations", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: "List organizations for user" })
  async list(@CurrentUser() user: any) {
    return this.orgsService.findByUser(user.id);
  }

  @Get(":organizationId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("organization.read")
  async get(@Param("organizationId") organizationId: string) {
    return this.orgsService.findOne(organizationId);
  }

  @Patch(":organizationId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("organization.update")
  async update(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.update(organizationId, dto);
  }

  @Get(":organizationId/members")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.read")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async listMembers(@Param("organizationId") organizationId: string, @Query("page") page = 1, @Query("limit") limit = 10) {
    return this.orgsService.listMembers(organizationId, Number(page), Number(limit));
  }

  @Post(":organizationId/invite")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.invite")
  async inviteMember(@Param("organizationId") organizationId: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.orgsService.inviteMember(organizationId, dto, user.id);
  }

  @Patch(":organizationId/members/:membershipId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.update")
  async updateMemberRole(@Param("organizationId") organizationId: string, @Param("membershipId") membershipId: string, @Body() dto: any) {
    return this.orgsService.updateMemberRole(organizationId, membershipId, dto);
  }

  @Delete(":organizationId/members/:membershipId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.remove")
  async removeMember(@Param("organizationId") organizationId: string, @Param("membershipId") membershipId: string) {
    return this.orgsService.removeMember(organizationId, membershipId);
  }

  @Get(":organizationId/roles")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("roles.read")
  async listRoles(@Param("organizationId") organizationId: string) {
    return this.orgsService.listRoles(organizationId);
  }

  @Post(":organizationId/roles")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("roles.manage")
  async createRole(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.createRole(organizationId, dto);
  }

  @Patch(":organizationId/roles/:roleId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("roles.manage")
  async updateRole(@Param("organizationId") organizationId: string, @Param("roleId") roleId: string, @Body() dto: any) {
    return this.orgsService.updateRole(organizationId, roleId, dto);
  }

  @Get(":organizationId/branches")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("branch.read")
  async listBranches(@Param("organizationId") organizationId: string) {
    return this.orgsService.listBranches(organizationId);
  }

  @Post(":organizationId/branches")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("branch.create")
  async createBranch(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.createBranch(organizationId, dto);
  }

  @Get(":organizationId/teams")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("team.read")
  async listTeams(@Param("organizationId") organizationId: string) {
    return this.orgsService.listTeams(organizationId);
  }

  @Post(":organizationId/teams")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("team.create")
  async createTeam(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.createTeam(organizationId, dto);
  }

  @Get(":organizationId/routing-rules")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("routing.read")
  async listRoutingRules(@Param("organizationId") organizationId: string) {
    return this.orgsService.listRoutingRules(organizationId);
  }

  @Post(":organizationId/routing-rules")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("routing.create")
  async createRoutingRule(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.createRoutingRule(organizationId, dto);
  }

  @Get(":organizationId/working-hours")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.read")
  async listWorkingHours(@Param("organizationId") organizationId: string) {
    return this.orgsService.listWorkingHours(organizationId);
  }

  @Post(":organizationId/working-hours")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.update")
  async setWorkingHours(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.setWorkingHours(organizationId, dto);
  }

  @Get(":organizationId/holidays")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.read")
  async listHolidays(@Param("organizationId") organizationId: string) {
    return this.orgsService.listHolidays(organizationId);
  }

  @Post(":organizationId/holidays")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.update")
  async addHoliday(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.addHoliday(organizationId, dto);
  }

  @Get(":organizationId/sla-policies")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("sla.read")
  async listSlaPolicies(@Param("organizationId") organizationId: string) {
    return this.orgsService.listSlaPolicies(organizationId);
  }

  @Post(":organizationId/sla-policies")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("sla.create")
  async createSlaPolicy(@Param("organizationId") organizationId: string, @Body() dto: any) {
    return this.orgsService.createSlaPolicy(organizationId, dto);
  }
}
