import { BadRequestException, Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AiAgentsService } from "./ai-agents.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CurrentOrganization } from "../common/decorators/current-organization.decorator";

@ApiTags("AI Agents")
@Controller({ path: "ai-agents", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class AiAgentsController {
  constructor(private readonly aiAgentsService: AiAgentsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async list(@CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.findAll(organizationId);
  }

  @Get(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async get(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.findOne(id, organizationId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async create(@CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.aiAgentsService.create({ ...dto, organizationId });
  }

  @Patch(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async update(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.aiAgentsService.update(id, organizationId, dto);
  }

  @Post(":id/publish")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.publish")
  async publish(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.publish(id, organizationId);
  }

  @Post(":id/test")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async testAgent(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: { input: string }) {
    // The agent pipeline clamps too, but this endpoint takes its input straight
    // from a text box, so reject an oversized body here rather than silently
    // truncating what the operator typed and showing them a reply to something
    // they did not send.
    if (typeof dto?.input !== "string" || dto.input.length === 0) {
      throw new BadRequestException("INPUT_REQUIRED");
    }
    if (dto.input.length > 4000) {
      throw new BadRequestException("INPUT_TOO_LONG");
    }
    return this.aiAgentsService.testAgent(id, organizationId, dto.input);
  }

  @Get(":id/versions")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listVersions(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.listVersions(id, organizationId);
  }

  @Post(":id/versions/:versionId/rollback")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.publish")
  async rollback(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Param("versionId") versionId: string) {
    return this.aiAgentsService.rollback(id, organizationId, versionId);
  }

  @Post(":id/clone")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async clone(@Param("id") id: string, @CurrentOrganization() organizationId: string, @CurrentUser() user: any) {
    return this.aiAgentsService.cloneAgent(id, organizationId, user.id);
  }

  @Get(":id/runs")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listRuns(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.listRuns(id, organizationId);
  }

  @Get(":id/feedback")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listFeedback(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.listFeedback(id, organizationId);
  }

  @Post(":id/feedback")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async submitFeedback(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.aiAgentsService.submitFeedback(id, organizationId, dto, user.id);
  }

  @Get(":id/evaluation")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listEvaluationCases(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.listEvaluationCases(id, organizationId);
  }

  @Post(":id/evaluation")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async runEvaluation(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.runEvaluation(id, organizationId);
  }

  @Get(":id/policies")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listPolicies(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.listPolicies(id, organizationId);
  }

  @Post(":id/policies")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async createPolicy(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.aiAgentsService.createPolicy(id, organizationId, dto);
  }

  @Get(":id/tools")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listTools(@Param("id") id: string, @CurrentOrganization() organizationId: string) {
    return this.aiAgentsService.listTools(id, organizationId);
  }

  @Post(":id/tools")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async registerTool(@Param("id") id: string, @CurrentOrganization() organizationId: string, @Body() dto: any) {
    return this.aiAgentsService.registerTool(id, organizationId, dto);
  }
}
