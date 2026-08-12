import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../common/guards/auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { MarketingGuard } from "../guards/marketing.guard";
import { LeadsService } from "./leads.service";
import { LeadImportService } from "./lead-import.service";
import { CurrentOrganization } from "../../common/decorators/current-organization.decorator";

@ApiTags("Marketing — Leads")
@Controller({ path: "marketing/leads", version: "1" })
@UseGuards(AuthGuard, MarketingGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(private readonly leads: LeadsService, private readonly leadImport: LeadImportService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async list(
    @CurrentOrganization() organizationId: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.leads.list(organizationId, {
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("provider-status")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async providerStatus(@CurrentOrganization() organizationId: string) {
    return this.leads.getProviderStatus(organizationId);
  }

  @Get("imports")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async listImports(@CurrentOrganization() organizationId: string) {
    return this.leadImport.listImports(organizationId);
  }

  @Get(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async get(@CurrentOrganization() organizationId: string, @Param("id") id: string) {
    return this.leads.findOne(organizationId, id);
  }

  @Post("discover")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.leads.manage")
  async discover(@Body() dto: any, @CurrentUser() user: any) {
    return this.leads.discover(dto, user.id);
  }

  @Post("import/preview")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.leads.manage")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importPreview(
    @UploadedFile() file: any,
    @Body("organizationId") organizationId: string
  ) {
    if (!file) throw new BadRequestException("FILE_REQUIRED");
    if (!organizationId) throw new BadRequestException("ORGANIZATION_REQUIRED");
    const rows = await this.leadImport.parseFile(file.originalname, file.mimetype, file.buffer);
    const preview = await this.leadImport.preview(organizationId, rows);
    return { filename: file.originalname, ...preview };
  }

  @Post("import/commit")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.leads.manage")
  async importCommit(@Body() dto: any, @CurrentUser() user: any) {
    return this.leadImport.commit(dto, user.id);
  }

  @Get(":id/eligibility")
  @UseGuards(PermissionGuard)
  @RequirePermission("marketing.read")
  async eligibility(@CurrentOrganization() organizationId: string, @Param("id") id: string) {
    return this.leads.checkEligibility(organizationId, id);
  }
}
