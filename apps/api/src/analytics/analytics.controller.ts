import { Controller, Get, Query, UseGuards, Res } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AnalyticsService } from "./analytics.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { Response } from "express";
import { CurrentOrganization } from "../common/decorators/current-organization.decorator";

@ApiTags("Analytics")
@Controller({ path: "analytics", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("dashboard")
  @UseGuards(PermissionGuard)
  @RequirePermission("analytics.read")
  async dashboard(@CurrentOrganization() organizationId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analyticsService.getDashboard(organizationId, from, to);
  }

  @Get("conversations")
  @UseGuards(PermissionGuard)
  @RequirePermission("analytics.read")
  async conversations(@CurrentOrganization() organizationId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analyticsService.getConversationMetrics(organizationId, from, to);
  }

  @Get("agents")
  @UseGuards(PermissionGuard)
  @RequirePermission("analytics.read")
  async agents(@CurrentOrganization() organizationId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analyticsService.getAgentMetrics(organizationId, from, to);
  }

  @Get("team")
  @UseGuards(PermissionGuard)
  @RequirePermission("analytics.read")
  async team(@CurrentOrganization() organizationId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analyticsService.getTeamMetrics(organizationId, from, to);
  }

  @Get("export")
  @UseGuards(PermissionGuard)
  @RequirePermission("analytics.read")
  async exportMetrics(
    @CurrentOrganization() organizationId: string, 
    @Query("type") type: string,
    @Query("from") from: string, 
    @Query("to") to: string,
    @Res() res: Response
  ) {
    const csvData = await this.analyticsService.exportMetrics(organizationId, type, from, to);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=analytics-${type}-${organizationId}.csv`);
    return res.send(csvData);
  }
}
