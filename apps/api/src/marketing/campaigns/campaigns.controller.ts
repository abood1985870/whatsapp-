import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../common/guards/auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MarketingGuard } from "../guards/marketing.guard";
import { CampaignsService } from "./campaigns.service";
import { CampaignDispatchService } from "./campaign-dispatch.service";
import { CurrentOrganization } from "../../common/decorators/current-organization.decorator";

@ApiTags("Marketing — Campaigns")
@Controller({ path: "marketing/campaigns", version: "1" })
@UseGuards(AuthGuard, MarketingGuard)
@ApiBearerAuth()
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly dispatch: CampaignDispatchService
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async list(
    @CurrentOrganization() organizationId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.campaigns.list(organizationId, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 25);
  }

  @Get(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async detail(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
    @Query("recipientPage") recipientPage?: string,
    @Query("recipientLimit") recipientLimit?: string
  ) {
    return this.campaigns.detail(
      organizationId,
      id,
      recipientPage ? parseInt(recipientPage, 10) : 1,
      recipientLimit ? parseInt(recipientLimit, 10) : 50
    );
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.manage")
  async create(@Body() dto: any, @CurrentUser() user: any) {
    return this.campaigns.create(dto, user.id, { overridePreviousContact: dto?.overridePreviousContact === true });
  }

  @Post(":id/prepare")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.manage")
  async prepare(@CurrentOrganization() organizationId: string, @Param("id") id: string, @CurrentUser() user: any) {
    const campaign = await this.campaigns.prepare(organizationId, id, user.id);
    // Kick off personalization; inline-safe (no queue dependency).
    void this.runPreparation(id).catch(() => undefined);
    return campaign;
  }

  @Get(":id/dry-run")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.manage")
  async dryRun(@CurrentOrganization() organizationId: string, @Param("id") id: string) {
    return this.campaigns.dryRun(organizationId, id);
  }

  @Get(":id/preview")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.manage")
  async preview(@CurrentOrganization() organizationId: string, @Param("id") id: string) {
    return this.campaigns.previewMessages(organizationId, id);
  }

  @Post(":id/recipients/:recipientId/regenerate")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.manage")
  async regenerate(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
    @Param("recipientId") recipientId: string
  ) {
    const result = await this.campaigns.regeneratePersonalization(organizationId, id, recipientId);
    void this.runPreparation(id).catch(() => undefined);
    return result;
  }

  @Post(":id/test-send")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.manage")
  async testSend(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
    @Body("recipientId") recipientId: string,
    @CurrentUser() user: any
  ) {
    return this.campaigns.testSend(organizationId, id, recipientId, user.id);
  }

  @Post(":id/start")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.start")
  async start(@CurrentOrganization() organizationId: string, @Param("id") id: string, @CurrentUser() user: any) {
    const campaign = await this.campaigns.start(organizationId, id, user.id);
    void this.runDispatch(id).catch(() => undefined);
    return campaign;
  }

  @Post(":id/pause")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.start")
  async pause(@CurrentOrganization() organizationId: string, @Param("id") id: string, @CurrentUser() user: any) {
    return this.campaigns.pause(organizationId, id, user.id);
  }

  @Post(":id/resume")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.start")
  async resume(@CurrentOrganization() organizationId: string, @Param("id") id: string, @CurrentUser() user: any) {
    const campaign = await this.campaigns.start(organizationId, id, user.id);
    void this.runDispatch(id).catch(() => undefined);
    return campaign;
  }

  @Post(":id/cancel")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.campaigns.manage")
  async cancel(@CurrentOrganization() organizationId: string, @Param("id") id: string, @CurrentUser() user: any) {
    return this.campaigns.cancel(organizationId, id, user.id);
  }

  /** Bounded inline preparation loop (used when no worker/queue is active). */
  private async runPreparation(campaignId: string) {
    for (let i = 0; i < 200; i++) {
      const { done } = await this.dispatch.prepareBatch(campaignId, 5);
      if (done) break;
    }
  }

  /** Bounded inline dispatch loop (used when no worker/queue is active). */
  private async runDispatch(campaignId: string) {
    for (let i = 0; i < 500; i++) {
      const { done } = await this.dispatch.dispatchBatch(campaignId, 5);
      if (done) break;
    }
  }
}
