import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { KnowledgeService } from "./knowledge.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentOrganization } from "../common/decorators/current-organization.decorator";

@ApiTags("Knowledge Base")
@Controller({ path: "knowledge", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get("bases")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async listBases(@CurrentOrganization() organizationId: string) {
    return this.knowledgeService.findBases(organizationId);
  }

  @Get("bases/:id")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async getBase(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.knowledgeService.findBase(id, organizationId);
  }

  @Post("bases")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createBase(@CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.knowledgeService.createBase({ ...dto, organizationId });
  }

  @Post("sources")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createSource(@CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.knowledgeService.createSource({ ...dto, organizationId });
  }

  @Get("faq")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async listFaq(@CurrentOrganization() organizationId: string) {
    return this.knowledgeService.findFaq(organizationId);
  }

  @Post("faq")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createFaq(@CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.knowledgeService.createFaq({ ...dto, organizationId });
  }

  @Post("bases/:id/sync")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async syncBase(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.knowledgeService.syncBase(id, organizationId);
  }

  @Get("bases/:id/stats")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async getBaseStats(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.knowledgeService.getBaseStats(id, organizationId);
  }

  @Post("bases/:id/documents")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async uploadDocument(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.knowledgeService.uploadDocument(id, organizationId, dto);
  }

  @Delete("documents/:id")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.delete")
  async deleteDocument(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.knowledgeService.deleteDocument(id, organizationId);
  }

  @Post("documents/:id/reprocess")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async reprocessDocument(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.knowledgeService.reprocessDocument(id, organizationId);
  }

  @Get("search")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async search(@CurrentOrganization() organizationId: string, @Query("query") query: string, @Query("baseId") baseId?: string) {
    return this.knowledgeService.search(organizationId, query, baseId);
  }

  @Get("categories")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async listCategories(@CurrentOrganization() organizationId: string) {
    return this.knowledgeService.listCategories(organizationId);
  }

  @Post("categories")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createCategory(@CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.knowledgeService.createCategory({ ...dto, organizationId });
  }
}
