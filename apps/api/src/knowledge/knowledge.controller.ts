import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { KnowledgeService } from "./knowledge.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrganizationGuard } from "../common/guards/organization.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";

@ApiTags("Knowledge Base")
@Controller({ path: "knowledge", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get("bases")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async listBases(@Query("organizationId") organizationId: string) {
    return this.knowledgeService.findBases(organizationId);
  }

  @Get("bases/:id")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async getBase(@Param("id") id: string) {
    return this.knowledgeService.findBase(id);
  }

  @Post("bases")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createBase(@Body() dto: any) {
    return this.knowledgeService.createBase(dto);
  }

  @Post("sources")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createSource(@Body() dto: any) {
    return this.knowledgeService.createSource(dto);
  }

  @Get("faq")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async listFaq(@Query("organizationId") organizationId: string) {
    return this.knowledgeService.findFaq(organizationId);
  }

  @Post("faq")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createFaq(@Body() dto: any) {
    return this.knowledgeService.createFaq(dto);
  }

  @Post("bases/:id/sync")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async syncBase(@Param("id") id: string) {
    return this.knowledgeService.syncBase(id);
  }

  @Get("bases/:id/stats")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async getBaseStats(@Param("id") id: string) {
    return this.knowledgeService.getBaseStats(id);
  }

  @Post("bases/:id/documents")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async uploadDocument(@Param("id") id: string, @Body() dto: any) {
    return this.knowledgeService.uploadDocument(id, dto);
  }

  @Delete("documents/:id")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.delete")
  async deleteDocument(@Param("id") id: string) {
    return this.knowledgeService.deleteDocument(id);
  }

  @Post("documents/:id/reprocess")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async reprocessDocument(@Param("id") id: string) {
    return this.knowledgeService.reprocessDocument(id);
  }

  @Get("search")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async search(@Query("organizationId") organizationId: string, @Query("query") query: string, @Query("baseId") baseId?: string) {
    return this.knowledgeService.search(organizationId, query, baseId);
  }

  @Get("categories")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.read")
  async listCategories(@Query("organizationId") organizationId: string) {
    return this.knowledgeService.listCategories(organizationId);
  }

  @Post("categories")
  @UseGuards(PermissionGuard)
  @RequirePermission("knowledge.upload")
  async createCategory(@Body() dto: any) {
    return this.knowledgeService.createCategory(dto);
  }
}
