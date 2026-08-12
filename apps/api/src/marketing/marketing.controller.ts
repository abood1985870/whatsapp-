import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { MarketingEntitlementsService } from "./entitlements.service";
import { MarketingGuard } from "./guards/marketing.guard";
import { MarketingSettingsService } from "./settings/marketing-settings.service";

@ApiTags("Marketing")
@Controller({ path: "marketing", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class MarketingController {
  constructor(
    private readonly entitlements: MarketingEntitlementsService,
    private readonly settings: MarketingSettingsService
  ) {}

  /**
   * Entitlement snapshot for the caller's organization. Deliberately NOT
   * behind MarketingGuard: the web app uses it to decide whether to show
   * the marketing navigation at all.
   */
  @Get("entitlements")
  async myEntitlements(@Query("organizationId") organizationId: string, @CurrentUser() user: any) {
    const memberships = (user.memberships || []).filter((m: any) => m.status === "ACTIVE");
    const membership = organizationId
      ? memberships.find((m: any) => m.organizationId === organizationId)
      : memberships[0];
    if (!membership) return { enabled: false, capabilities: {} };
    const capabilities = await this.entitlements.listForOrganization(membership.organizationId);
    return {
      enabled: capabilities.AI_SALES_MODULE === true,
      organizationId: membership.organizationId,
      capabilities,
    };
  }

  @Get("settings")
  @UseGuards(MarketingGuard, PermissionGuard)
  @RequirePermission("marketing.read")
  async getSettings(@Query("organizationId") organizationId: string) {
    return this.settings.getOrCreate(organizationId);
  }

  @Patch("settings")
  @UseGuards(MarketingGuard, PermissionGuard)
  @RequirePermission("marketing.settings.manage")
  async updateSettings(@Body() dto: any, @CurrentUser() user: any) {
    return this.settings.update(dto, user.id);
  }
}
