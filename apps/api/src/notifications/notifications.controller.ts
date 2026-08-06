import { Controller, Get, Post, Patch, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";
import { AuthGuard } from "../common/guards/auth.guard";

@ApiTags("Notifications")
@Controller({ path: "notifications", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}
  @Get() @ApiOperation({ summary: "List user notifications" }) async list(@Query("userId") userId: string, @Query("organizationId") organizationId: string) { return this.notificationsService.findByUser(userId, organizationId); }
  @Post(":id/read") @ApiOperation({ summary: "Mark notification as read" }) async markRead(@Param("id") id: string) { return this.notificationsService.markAsRead(id); }
  @Post("read-all") @ApiOperation({ summary: "Mark all as read" }) async markAllRead(@Query("userId") userId: string, @Query("organizationId") organizationId: string) { return this.notificationsService.markAllAsRead(userId, organizationId); }
}
