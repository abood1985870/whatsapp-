import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { MarketingEntitlementsService } from "../marketing/entitlements.service";
import { VoiceGuard } from "./guards/voice.guard";
import { VoiceAgentsService } from "./voice-agents.service";
import { VoiceNumbersService } from "./voice-numbers.service";
import { VoiceCallsService } from "./voice-calls.service";
import { VoiceSettingsService } from "./voice-settings.service";
import { VoiceDiagnosticsService } from "./voice-diagnostics.service";
import { CallerIdentityService } from "./caller-identity.service";

@ApiTags("Voice")
@Controller({ path: "voice", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class VoiceController {
  constructor(
    private readonly entitlements: MarketingEntitlementsService,
    private readonly agents: VoiceAgentsService,
    private readonly numbers: VoiceNumbersService,
    private readonly calls: VoiceCallsService,
    private readonly settings: VoiceSettingsService,
    private readonly diagnostics: VoiceDiagnosticsService,
    private readonly identity: CallerIdentityService
  ) {}

  /**
   * Entitlement snapshot. Not behind VoiceGuard: the web app calls it to
   * decide whether to render the voice navigation at all.
   */
  @Get("entitlements")
  async myEntitlements(@Query("organizationId") organizationId: string, @CurrentUser() user: any) {
    const memberships = (user.memberships || []).filter((m: any) => m.status === "ACTIVE");
    const membership = organizationId
      ? memberships.find((m: any) => m.organizationId === organizationId)
      : memberships[0];
    if (!membership) return { enabled: false, capabilities: {} };
    const capabilities = await this.entitlements.listVoiceForOrganization(membership.organizationId);
    return { enabled: capabilities.AI_VOICE_MODULE === true, organizationId: membership.organizationId, capabilities };
  }

  // ------------------------------------------------------------------ agents

  @Get("agents")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.read")
  async listAgents(@Query("organizationId") organizationId: string) {
    return this.agents.list(organizationId);
  }

  @Get("agents/tools")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.read")
  async listTools() {
    return this.agents.availableTools();
  }

  @Post("agents")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.agent.manage")
  async createAgent(@Body() dto: any, @CurrentUser() user: any) {
    return this.agents.create(dto.organizationId, dto, user.id);
  }

  @Patch("agents/:id")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.agent.manage")
  async updateAgent(@Query("organizationId") organizationId: string, @Param("id") id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.agents.update(organizationId, id, dto, user.id);
  }

  @Post("agents/:id/status")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.agent.manage")
  async setAgentStatus(
    @Query("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body("status") status: string,
    @CurrentUser() user: any
  ) {
    return this.agents.setStatus(organizationId, id, status, user.id);
  }

  @Get("agents/:id/versions")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.read")
  async agentVersions(@Query("organizationId") organizationId: string, @Param("id") id: string) {
    return this.agents.listVersions(organizationId, id);
  }

  @Post("agents/:id/rollback")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.agent.manage")
  async rollbackAgent(
    @Query("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body("version") version: number,
    @CurrentUser() user: any
  ) {
    return this.agents.rollback(organizationId, id, Number(version), user.id);
  }

  // ----------------------------------------------------------------- numbers

  @Get("numbers")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.read")
  async listNumbers(@Query("organizationId") organizationId: string) {
    return this.numbers.list(organizationId);
  }

  @Get("numbers/available")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.numbers.manage")
  async availableNumbers(@Query("organizationId") organizationId: string, @Query("countryCode") countryCode = "SA") {
    return this.numbers.listAvailable(organizationId, countryCode);
  }

  @Post("numbers/existing")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.numbers.manage")
  async registerExistingNumber(@Body() dto: any, @CurrentUser() user: any) {
    return this.numbers.registerExisting(dto.organizationId, dto, user.id);
  }

  @Post("numbers/provision")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.numbers.manage")
  async provisionNumber(@Body() dto: any, @CurrentUser() user: any) {
    return this.numbers.provision(dto.organizationId, String(dto.phoneNumber), user.id);
  }

  @Delete("numbers/:id")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.numbers.manage")
  async removeNumber(@Query("organizationId") organizationId: string, @Param("id") id: string, @CurrentUser() user: any) {
    return this.numbers.remove(organizationId, id, user.id);
  }

  // ------------------------------------------------------------------- calls

  @Get("calls")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.calls.read")
  async listCalls(
    @Query("organizationId") organizationId: string,
    @Query("status") status?: string,
    @Query("outcome") outcome?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.calls.list(organizationId, {
      status,
      outcome,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("calls/:id")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.calls.read")
  async callDetail(@Query("organizationId") organizationId: string, @Param("id") id: string) {
    return this.calls.detail(organizationId, id);
  }

  @Post("calls/:id/recording-access")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.recordings.access")
  async recordingAccess(@Query("organizationId") organizationId: string, @Param("id") id: string, @CurrentUser() user: any) {
    return this.calls.requestRecordingAccess(organizationId, id, user.id);
  }

  @Get("analytics")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.analytics.read")
  async analytics(@Query("organizationId") organizationId: string) {
    return this.calls.analytics(organizationId);
  }

  @Get("customers/:contactId/timeline")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.calls.read")
  async customerTimeline(@Query("organizationId") organizationId: string, @Param("contactId") contactId: string) {
    return this.identity.timeline(organizationId, contactId);
  }

  // ---------------------------------------------------------------- settings

  @Get("settings")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.read")
  async getSettings(@Query("organizationId") organizationId: string) {
    return this.settings.getOrCreate(organizationId);
  }

  @Patch("settings")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.settings.manage")
  async updateSettings(@Body() dto: any, @CurrentUser() user: any) {
    return this.settings.update(dto.organizationId, dto, user.id);
  }

  // ------------------------------------------------------------- diagnostics

  @Get("diagnostics")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.read")
  async diagnosticsOverview(@Query("organizationId") organizationId: string) {
    return this.diagnostics.overview(organizationId);
  }

  @Post("diagnostics/provider-check")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.diagnostics.run")
  async providerCheck(@Body("organizationId") organizationId: string, @CurrentUser() user: any) {
    return this.diagnostics.checkProvider(organizationId, user.id);
  }

  @Post("diagnostics/realtime-check")
  @UseGuards(VoiceGuard, PermissionGuard)
  @RequirePermission("voice.diagnostics.run")
  async realtimeCheck() {
    return this.diagnostics.checkRealtime();
  }
}
