import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { MessagesService } from "./messages.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentMembership } from "../common/decorators/current-membership.decorator";
import { FileInterceptor } from "@nestjs/platform-express";

@ApiTags("Messages")
@Controller({ path: "messages", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.read")
  async list(@Query("conversationId") conversationId: string, @Query("cursor") cursor?: string) {
    return this.messagesService.findByConversation(conversationId, cursor);
  }

  @Get("search")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.read")
  async search(@Query("organizationId") organizationId: string, @Query("q") query: string) {
    return this.messagesService.searchMessages(organizationId, query);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.reply")
  async send(@Body() dto: { conversationId: string; text: string }, @CurrentMembership() membership: any) {
    // organizationId/membershipId come from the authenticated membership,
    // never from the client body (tenant isolation)
    return this.messagesService.sendMessage({
      conversationId: dto.conversationId,
      text: dto.text,
      organizationId: membership.organizationId,
      membershipId: membership.id
    });
  }

  @Post("media")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.reply")
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, conversationId: { type: 'string' }, organizationId: { type: 'string' }, membershipId: { type: 'string' }, caption: { type: 'string' } } } })
  async sendMedia(
    @UploadedFile() file: any, 
    @Body() dto: { conversationId: string; organizationId: string; membershipId: string; caption?: string }
  ) {
    return this.messagesService.sendMediaMessage(file, dto);
  }

  @Post("template")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.reply")
  async sendTemplate(@Body() dto: { conversationId: string; templateName: string; parameters: any[]; organizationId: string; membershipId: string }) {
    return this.messagesService.sendTemplateMessage(dto);
  }

  @Post("internal")
  @UseGuards(PermissionGuard)
  @RequirePermission("conversations.reply")
  async addNote(@Body() dto: { conversationId: string; content: string; membershipId: string }) {
    return this.messagesService.addInternalNote(dto.conversationId, dto.membershipId, dto.content);
  }

  @Post(":id/retry")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.reply")
  async retry(@Param("id") id: string) {
    return this.messagesService.retryMessage(id);
  }

  @Delete(":id")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("conversations.reply")
  async delete(@Param("id") id: string) {
    return this.messagesService.softDeleteMessage(id);
  }
}
