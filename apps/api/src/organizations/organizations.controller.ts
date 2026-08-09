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

  @Get(":id")
  @UseGuards(OrganizationGuard)
  @RequirePermission("organization.read")
  async get(@Param("id") id: string) {
    return this.orgsService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("organization.update")
  async update(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.update(id, dto);
  }

  @Get(":id/members")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.read")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async listMembers(@Param("id") id: string, @Query("page") page = 1, @Query("limit") limit = 10) {
    return this.orgsService.listMembers(id, Number(page), Number(limit));
  }

  @Post(":id/invite")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.invite")
  async inviteMember(@Param("id") id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.orgsService.inviteMember(id, dto, user.id);
  }

  @Patch(":id/members/:membershipId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.update")
  async updateMemberRole(@Param("id") id: string, @Param("membershipId") membershipId: string, @Body() dto: any) {
    return this.orgsService.updateMemberRole(id, membershipId, dto);
  }

  @Delete(":id/members/:membershipId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("members.remove")
  async removeMember(@Param("id") id: string, @Param("membershipId") membershipId: string) {
    return this.orgsService.removeMember(id, membershipId);
  }

  @Get(":id/roles")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("roles.read")
  async listRoles(@Param("id") id: string) {
    return this.orgsService.listRoles(id);
  }

  @Post(":id/roles")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("roles.manage")
  async createRole(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.createRole(id, dto);
  }

  @Patch(":id/roles/:roleId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("roles.manage")
  async updateRole(@Param("id") id: string, @Param("roleId") roleId: string, @Body() dto: any) {
    return this.orgsService.updateRole(id, roleId, dto);
  }

  @Get(":id/branches")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("branch.read")
  async listBranches(@Param("id") id: string) {
    return this.orgsService.listBranches(id);
  }

  @Post(":id/branches")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("branch.create")
  async createBranch(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.createBranch(id, dto);
  }

  @Get(":id/teams")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("team.read")
  async listTeams(@Param("id") id: string) {
    return this.orgsService.listTeams(id);
  }

  @Post(":id/teams")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("team.create")
  async createTeam(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.createTeam(id, dto);
  }

  @Get(":id/routing-rules")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("routing.read")
  async listRoutingRules(@Param("id") id: string) {
    return this.orgsService.listRoutingRules(id);
  }

  @Post(":id/routing-rules")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("routing.create")
  async createRoutingRule(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.createRoutingRule(id, dto);
  }

  @Get(":id/working-hours")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.read")
  async listWorkingHours(@Param("id") id: string) {
    return this.orgsService.listWorkingHours(id);
  }

  @Post(":id/working-hours")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.update")
  async setWorkingHours(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.setWorkingHours(id, dto);
  }

  @Get(":id/holidays")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.read")
  async listHolidays(@Param("id") id: string) {
    return this.orgsService.listHolidays(id);
  }

  @Post(":id/holidays")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("settings.update")
  async addHoliday(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.addHoliday(id, dto);
  }

  @Get(":id/sla-policies")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("sla.read")
  async listSlaPolicies(@Param("id") id: string) {
    return this.orgsService.listSlaPolicies(id);
  }

  @Post(":id/sla-policies")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("sla.create")
  async createSlaPolicy(@Param("id") id: string, @Body() dto: any) {
    return this.orgsService.createSlaPolicy(id, dto);
  }
}
