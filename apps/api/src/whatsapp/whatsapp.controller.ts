import { Controller, Post, Get, Delete, Body, Param, UseGuards, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { WhatsAppService } from "./whatsapp.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("WhatsApp")
@Controller({ path: "whatsapp", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post("connections")
  @UseGuards(PermissionGuard)
  @RequirePermission("whatsapp.connect")
  async createConnection(@Body() dto: { organizationId: string; name: string }) {
    return this.whatsappService.createConnection(dto.organizationId, dto.name);
  }

  @Get("connections/:id/qr")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("whatsapp.connect")
  async getQrCode(@Param("id") id: string, @CurrentUser() user: any) {
    return this.whatsappService.getQrCode(id, user);
  }

  @Get("connections/:id/status")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("whatsapp.read")
  async getStatus(@Param("id") id: string, @CurrentUser() user: any) {
    return this.whatsappService.getStatus(id, user);
  }

  @Delete("connections/:id")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("whatsapp.disconnect")
  async deleteConnection(@Param("id") id: string, @CurrentUser() user: any) {
    return this.whatsappService.deleteConnection(id, user);
  }

  @Get("connections")
  @UseGuards(PermissionGuard)
  @RequirePermission("whatsapp.read")
  async listConnections(@Query("organizationId") organizationId: string) {
    return this.whatsappService.findByOrganization(organizationId);
  }

  @Post("connections/:id/reconnect")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("whatsapp.connect")
  async reconnect(@Param("id") id: string, @CurrentUser() user: any) {
    return this.whatsappService.reconnect(id, user);
  }

  @Post("connections/:id/webhook")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("whatsapp.update")
  async configureWebhook(@Param("id") id: string, @Body() dto: { url: string }, @CurrentUser() user: any) {
    return this.whatsappService.configureWebhook(id, dto.url, user);
  }

  @Get("connections/:id/health")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("whatsapp.read")
  async getHealth(@Param("id") id: string, @CurrentUser() user: any) {
    return this.whatsappService.getHealth(id, user);
  }

  @Post("connections/:id/send-message")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("message.send")
  async sendMessage(@Param("id") id: string, @Body() dto: { to: string; text: string }, @CurrentUser() user: any) {
    return this.whatsappService.sendMessage(id, dto.to, dto.text, user);
  }

  @Post("connections/:id/send-template")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("message.send")
  async sendTemplate(@Param("id") id: string, @Body() dto: { to: string; templateName: string; parameters: any[] }, @CurrentUser() user: any) {
    return this.whatsappService.sendTemplate(id, dto.to, dto.templateName, dto.parameters, user);
  }

  @Post("connections/:id/broadcast")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("message.broadcast")
  async broadcast(@Param("id") id: string, @Body() dto: { contacts: string[]; text: string }, @CurrentUser() user: any) {
    return this.whatsappService.broadcast(id, dto.contacts, dto.text, user);
  }

  @Get("media/:messageId")
  @UseGuards(OrganizationGuard, PermissionGuard)
  @RequirePermission("message.read")
  async downloadMedia(@Query("connectionId") connectionId: string, @Param("messageId") messageId: string, @CurrentUser() user: any) {
    return this.whatsappService.getMedia(connectionId, messageId, user);
  }
}
