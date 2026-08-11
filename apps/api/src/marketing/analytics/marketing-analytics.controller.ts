import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../common/guards/auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { MarketingGuard } from "../guards/marketing.guard";
import { MarketingAnalyticsService } from "./marketing-analytics.service";

@ApiTags("Marketing — Analytics")
@Controller({ path: "marketing/analytics", version: "1" })
@UseGuards(AuthGuard, MarketingGuard)
@ApiBearerAuth()
export class MarketingAnalyticsController {
  constructor(private readonly analytics: MarketingAnalyticsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.analytics.read")
  async overview(@Query("organizationId") organizationId: string) {
    return this.analytics.overview(organizationId);
  }
}
