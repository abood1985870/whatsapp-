import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../common/guards/auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MarketingGuard } from "../guards/marketing.guard";
import { DncService } from "./dnc.service";

@ApiTags("Marketing — Do Not Contact")
@Controller({ path: "marketing/dnc", version: "1" })
@UseGuards(AuthGuard, MarketingGuard)
@ApiBearerAuth()
export class DncController {
  constructor(private readonly dnc: DncService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async list(
    @Query("organizationId") organizationId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.dnc.list(organizationId, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.dnc.manage")
  async add(@Body() dto: any, @CurrentUser() user: any) {
    return this.dnc.add(dto, user.id, "MANUAL");
  }

  @Delete(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.dnc.manage")
  async remove(
    @Query("organizationId") organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: any
  ) {
    return this.dnc.remove(organizationId, id, user.id);
  }
}
