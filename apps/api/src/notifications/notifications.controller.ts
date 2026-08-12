import { Controller, Get, Post, Param, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";
import { AuthGuard } from "../common/guards/auth.guard";

/**
 * Notifications are always the caller's own.
 *
 * These routes previously took `userId` and `organizationId` as query
 * parameters and passed them straight into the `where` clause, so any
 * authenticated user could read any other user's notifications — including
 * users in organizations they have nothing to do with — by changing a number
 * in the URL. Both values now come from the verified token instead, and are
 * not accepted from the client at all.
 */
@ApiTags("Notifications")
@Controller({ path: "notifications", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Organizations the caller actually belongs to, per the token's user record. */
  private orgIds(req: any): string[] {
    return (req.user?.memberships ?? [])
      .filter((m: any) => m.status === "ACTIVE")
      .map((m: any) => m.organizationId);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's notifications" })
  async list(@Req() req: any) {
    return this.notificationsService.findByUser(req.user.id, this.orgIds(req));
  }

  @Post(":id/read")
  @ApiOperation({ summary: "Mark one of the caller's notifications as read" })
  async markRead(@Param("id") id: string, @Req() req: any) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Post("read-all")
  @ApiOperation({ summary: "Mark all of the caller's notifications as read" })
  async markAllRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id, this.orgIds(req));
  }
}
