import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ConversationsService } from "./conversations.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Conversations")
@Controller({ path: "conversations", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.read")
  async list(@Query("organizationId") organizationId: string, @Query("status") status?: string, @Query("assignedToMe") assignedToMe?: boolean, @Query("membershipId") membershipId?: string) {
    return this.conversationsService.findAll(organizationId, { status, assignedToMe, membershipId });
  }

  @Get("export")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.read")
  async exportConversations(@Query("organizationId") organizationId: string, @Res() res: Response) {
    const csvData = await this.conversationsService.exportToCsv(organizationId);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=conversations-${organizationId}.csv`);
    return res.send(csvData);
  }

  @Post("bulk-action")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.update")
  async bulkAction(@Body() dto: { organizationId: string; conversationIds: string[]; action: string; payload?: any }) {
    return this.conversationsService.bulkAction(dto.organizationId, dto.conversationIds, dto.action, dto.payload);
  }

  @Get(":id")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async get(@Param("id") id: string) {
    return this.conversationsService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.reply")
  async update(@Param("id") id: string, @Body() dto: any) {
    return this.conversationsService.update(id, dto);
  }

  @Post(":id/assign")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.assign")
  async assign(@Param("id") id: string, @Body() dto: { membershipId: string }) {
    return this.conversationsService.assign(id, dto.membershipId);
  }

  @Post(":id/resolve")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.close")
  async resolve(@Param("id") id: string) {
    return this.conversationsService.resolve(id);
  }

  @Post(":id/close")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.close")
  async close(@Param("id") id: string) {
    return this.conversationsService.resolve(id);
  }

  @Post(":id/snooze")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async snooze(@Param("id") id: string, @Body() dto: { until: string }) {
    return this.conversationsService.snooze(id, new Date(dto.until));
  }

  @Post(":id/unsnooze")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async unsnooze(@Param("id") id: string) {
    return this.conversationsService.unsnooze(id);
  }

  @Post(":id/reopen")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async reopen(@Param("id") id: string) {
    return this.conversationsService.reopen(id);
  }

  @Post(":id/block")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async block(@Param("id") id: string) {
    return this.conversationsService.block(id);
  }

  @Post(":id/tags")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async addTag(@Param("id") id: string, @Body() dto: { tagId: string }) {
    return this.conversationsService.addTag(id, dto.tagId);
  }

  @Delete(":id/tags/:tagId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async removeTag(@Param("id") id: string, @Param("tagId") tagId: string) {
    return this.conversationsService.removeTag(id, tagId);
  }

  @Post(":id/watch")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async watch(@Param("id") id: string, @Body() dto: { membershipId: string }) {
    return this.conversationsService.watch(id, dto.membershipId);
  }

  @Delete(":id/watch")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async unwatch(@Param("id") id: string, @Query("membershipId") membershipId: string) {
    return this.conversationsService.unwatch(id, membershipId);
  }

  @Get(":id/history")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async getHistory(@Param("id") id: string) {
    return this.conversationsService.getHistory(id);
  }

  @Get(":id/notes")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.read")
  async getNotes(@Param("id") id: string) {
    return this.conversationsService.getNotes(id);
  }

  @Post(":id/notes")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.reply")
  async addNote(@Param("id") id: string, @Body() dto: { membershipId: string; content: string }) {
    return this.conversationsService.addNote(id, dto.membershipId, dto.content);
  }

  @Post(":id/merge")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.update")
  async merge(@Param("id") id: string, @Body() dto: { targetConversationId: string }) {
    return this.conversationsService.merge(id, dto.targetConversationId);
  }
}
