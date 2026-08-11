import { BadRequestException, Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AiAgentsService } from "./ai-agents.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("AI Agents")
@Controller({ path: "ai-agents", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class AiAgentsController {
  constructor(private readonly aiAgentsService: AiAgentsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async list(@Query("organizationId") organizationId: string) {
    return this.aiAgentsService.findAll(organizationId);
  }

  @Get(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async get(@Param("id") id: string) {
    return this.aiAgentsService.findOne(id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async create(@Body() dto: any) {
    return this.aiAgentsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async update(@Param("id") id: string, @Body() dto: any) {
    return this.aiAgentsService.update(id, dto);
  }

  @Post(":id/publish")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.publish")
  async publish(@Param("id") id: string) {
    return this.aiAgentsService.publish(id);
  }

  @Post(":id/test")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async testAgent(@Param("id") id: string, @Body() dto: { input: string }) {
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
    return this.aiAgentsService.testAgent(id, dto.input);
  }

  @Get(":id/versions")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listVersions(@Param("id") id: string) {
    return this.aiAgentsService.listVersions(id);
  }

  @Post(":id/versions/:versionId/rollback")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.publish")
  async rollback(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.aiAgentsService.rollback(id, versionId);
  }

  @Post(":id/clone")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async clone(@Param("id") id: string, @CurrentUser() user: any) {
    return this.aiAgentsService.cloneAgent(id, user.id);
  }

  @Get(":id/runs")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listRuns(@Param("id") id: string) {
    return this.aiAgentsService.listRuns(id);
  }

  @Get(":id/feedback")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listFeedback(@Param("id") id: string) {
    return this.aiAgentsService.listFeedback(id);
  }

  @Post(":id/feedback")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async submitFeedback(@Param("id") id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.aiAgentsService.submitFeedback(id, dto, user.id);
  }

  @Get(":id/evaluation")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listEvaluationCases(@Param("id") id: string) {
    return this.aiAgentsService.listEvaluationCases(id);
  }

  @Post(":id/evaluation")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async runEvaluation(@Param("id") id: string) {
    return this.aiAgentsService.runEvaluation(id);
  }

  @Get(":id/policies")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listPolicies(@Param("id") id: string) {
    return this.aiAgentsService.listPolicies(id);
  }

  @Post(":id/policies")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async createPolicy(@Param("id") id: string, @Body() dto: any) {
    return this.aiAgentsService.createPolicy(id, dto);
  }

  @Get(":id/tools")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.read")
  async listTools(@Param("id") id: string) {
    return this.aiAgentsService.listTools(id);
  }

  @Post(":id/tools")
  @UseGuards(PermissionGuard)
  @RequirePermission("ai.configure")
  async registerTool(@Param("id") id: string, @Body() dto: any) {
    return this.aiAgentsService.registerTool(id, dto);
  }
}
