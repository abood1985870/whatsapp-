import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../common/guards/auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MarketingGuard } from "../guards/marketing.guard";
import { ProductsService } from "./products.service";
import { CurrentOrganization } from "../../common/decorators/current-organization.decorator";

@ApiTags("Marketing — Products")
@Controller({ path: "marketing/products", version: "1" })
@UseGuards(AuthGuard, MarketingGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async list(
    @CurrentOrganization() organizationId: string,
    @Query("includeInactive") includeInactive?: string
  ) {
    return this.products.list(organizationId, includeInactive === "true");
  }

  @Get(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async get(@CurrentOrganization() organizationId: string, @Param("id") id: string) {
    return this.products.findOne(organizationId, id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.products.manage")
  async create(@Body() dto: any, @CurrentUser() user: any) {
    return this.products.create(dto, user.id);
  }

  @Patch(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.products.manage")
  async update(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser() user: any
  ) {
    return this.products.update(organizationId, id, dto, user.id);
  }

  @Delete(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.products.manage")
  async remove(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: any
  ) {
    return this.products.softDelete(organizationId, id, user.id);
  }
}
