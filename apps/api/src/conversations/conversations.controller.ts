import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ConversationsService } from "./conversations.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CurrentOrganization } from "../common/decorators/current-organization.decorator";

@ApiTags("Conversations")
@Controller({ path: "conversations", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ConversationsController {
  // organizationId is taken from the caller's verified membership via
  // @CurrentOrganization, never from the query string or body. A client that
  // sends a different id no longer changes which tenant is read.
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.read")
  async list(@CurrentOrganization() organizationId: string, @Query("status") status?: string, @Query("assignedToMe") assignedToMe?: boolean, @Query("membershipId") membershipId?: string) {
    return this.conversationsService.findAll(organizationId, { status, assignedToMe, membershipId });
  }

  @Get("export")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.read")
  async exportConversations(@CurrentOrganization() organizationId: string, @Res() res: Response) {
    const csvData = await this.conversationsService.exportToCsv(organizationId);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=conversations-${organizationId}.csv`);
    return res.send(csvData);
  }

  @Post("bulk-action")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.update")
  async bulkAction(@CurrentOrganization() organizationId: string, @Body() dto: { conversationIds: string[]; action: string; payload?: any }) {
    return this.conversationsService.bulkAction(organizationId, dto.conversationIds, dto.action, dto.payload);
  }

  @Get(":id")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async get(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.findOne(id, organizationId);
  }

  @Patch(":id")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.reply")
  async update(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.conversationsService.update(id, organizationId, dto);
  }

  @Post(":id/assign")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.assign")
  async assign(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: { membershipId: string }) {
    return this.conversationsService.assign(id, organizationId, dto.membershipId);
  }

  @Post(":id/resolve")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.close")
  async resolve(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.resolve(id, organizationId);
  }

  @Post(":id/close")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.close")
  async close(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.resolve(id, organizationId);
  }

  @Post(":id/snooze")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async snooze(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: { until: string }) {
    return this.conversationsService.snooze(id, organizationId, new Date(dto.until));
  }

  @Post(":id/unsnooze")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async unsnooze(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.unsnooze(id, organizationId);
  }

  @Post(":id/reopen")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async reopen(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.reopen(id, organizationId);
  }

  @Post(":id/block")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async block(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.block(id, organizationId);
  }

  @Post(":id/tags")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async addTag(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: { tagId: string }) {
    return this.conversationsService.addTag(id, organizationId, dto.tagId);
  }

  @Delete(":id/tags/:tagId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async removeTag(@Param("id") id: string, @Param("tagId") tagId: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.removeTag(id, organizationId, tagId);
  }

  @Post(":id/watch")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async watch(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: { membershipId: string }) {
    return this.conversationsService.watch(id, organizationId, dto.membershipId);
  }

  @Delete(":id/watch")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async unwatch(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Query("membershipId") membershipId: string) {
    return this.conversationsService.unwatch(id, organizationId, membershipId);
  }

  @Get(":id/history")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async getHistory(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.getHistory(id, organizationId);
  }

  @Get(":id/notes")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async getNotes(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.conversationsService.getNotes(id, organizationId);
  }

  @Post(":id/notes")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.reply")
  async addNote(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: { membershipId: string; content: string }) {
    return this.conversationsService.addNote(id, organizationId, dto.membershipId, dto.content);
  }

  @Post(":id/merge")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async merge(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: { targetConversationId: string }) {
    return this.conversationsService.merge(id, organizationId, dto.targetConversationId);
  }
}
