import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CurrentOrganization } from "../common/decorators/current-organization.decorator";
import { PlatformOwnerGuard } from "./guards/platform-owner.guard";
import { SubscriptionRequestsService } from "./subscription-requests.service";

@ApiTags("Subscriptions — Requests")
@Controller({ path: "subscription-requests", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class SubscriptionRequestsController {
  constructor(private readonly requests: SubscriptionRequestsService) {}

  @Post()
  async create(@CurrentOrganization() organizationId: string, @CurrentUser("id") userId: string, @Body() dto: any) {
    return this.requests.create(organizationId, userId, dto);
  }

  @Get("mine")
  async mine(@CurrentOrganization() organizationId: string) {
    return this.requests.listMine(organizationId);
  }

  @Get()
  @UseGuards(PlatformOwnerGuard)
  async listAll(
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.requests.listAll({
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  @UseGuards(PlatformOwnerGuard)
  async getOne(@Param("id") id: string) {
    return this.requests.getOne(id);
  }

  @Post(":id/approve")
  @UseGuards(PlatformOwnerGuard)
  async approve(@Param("id") id: string, @CurrentUser("id") userId: string) {
    return this.requests.approve(id, userId);
  }

  @Post(":id/reject")
  @UseGuards(PlatformOwnerGuard)
  async reject(@Param("id") id: string, @CurrentUser("id") userId: string, @Body("reason") reason?: string) {
    return this.requests.reject(id, userId, reason);
  }
}
