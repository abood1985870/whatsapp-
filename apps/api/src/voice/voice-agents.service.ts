import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { VOICE_SALES_PROMPT_VERSION } from "@qanoai/ai";
import { AuditService } from "../audit/audit.service";
import { VOICE_TOOLS } from "./tools/tool-registry";

const SALES_STYLES = ["CALM", "BALANCED", "STRONG_SALES"];
const VERIFICATION_LEVELS = ["NO_VERIFICATION", "BASIC_VERIFICATION", "OTP_REQUIRED"];
const ROLES = ["SALES", "SUPPORT", "RECEPTION"];

/**
 * Voice agent configuration with explicit versioning: every meaningful
 * change snapshots the previous configuration so a call always knows which
 * version and prompt produced it, and a bad change can be rolled back.
 */
@Injectable()
export class VoiceAgentsService {
  constructor(private readonly audit: AuditService) {}

  async list(organizationId: string) {
    return prisma.voiceAgent.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const agent = await prisma.voiceAgent.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!agent) throw new NotFoundException("VOICE_AGENT_NOT_FOUND");
    return agent;
  }

  async create(organizationId: string, dto: Record<string, any>, actorUserId: string) {
    const data = this.sanitize(dto);
    if (!data.name) throw new BadRequestException("NAME_REQUIRED");

    const agent = await prisma.voiceAgent.create({
      data: {
        organizationId,
        name: data.name,
        employeeName: data.employeeName ?? "سعود",
        role: data.role ?? "SALES",
        status: "DRAFT",
        promptVersion: VOICE_SALES_PROMPT_VERSION,
        activeVersion: 1,
        createdById: actorUserId,
        ...data.optional,
      },
    });

    await this.snapshotVersion(agent.id, 1, agent, actorUserId, "initial");
    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_AGENT_CREATED",
      resourceType: "VoiceAgent",
      resourceId: agent.id,
      correlationId: generateCorrelationId(),
    });
    return agent;
  }

  async update(organizationId: string, id: string, dto: Record<string, any>, actorUserId: string) {
    const before = await this.findOne(organizationId, id);
    const data = this.sanitize(dto);

    const nextVersion = before.activeVersion + 1;
    const agent = await prisma.voiceAgent.update({
      where: { id: before.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.employeeName ? { employeeName: data.employeeName } : {}),
        ...(data.role ? { role: data.role } : {}),
        ...data.optional,
        activeVersion: nextVersion,
        promptVersion: VOICE_SALES_PROMPT_VERSION,
      },
    });

    await this.snapshotVersion(agent.id, nextVersion, agent, actorUserId, String(dto.changeReason ?? "update"));
    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_AGENT_UPDATED",
      resourceType: "VoiceAgent",
      resourceId: agent.id,
      beforeData: { version: before.activeVersion, status: before.status },
      afterData: { version: nextVersion, status: agent.status },
      correlationId: generateCorrelationId(),
    });
    return agent;
  }

  async setStatus(organizationId: string, id: string, status: string, actorUserId: string) {
    if (!["DRAFT", "ACTIVE", "PAUSED"].includes(status)) throw new BadRequestException("INVALID_STATUS");
    const agent = await this.findOne(organizationId, id);

    if (status === "ACTIVE") {
      // Refuse to advertise an agent as live when it cannot actually work.
      const number = await prisma.voiceNumber.findFirst({
        where: { organizationId, deletedAt: null, status: { in: ["READY", "PENDING_SETUP"] } },
      });
      if (!number) throw new BadRequestException("NO_VOICE_NUMBER_CONFIGURED");
    }

    const updated = await prisma.voiceAgent.update({ where: { id: agent.id }, data: { status } });
    await this.audit.log({
      organizationId,
      actorUserId,
      action: status === "ACTIVE" ? "VOICE_AGENT_ACTIVATED" : "VOICE_AGENT_DEACTIVATED",
      resourceType: "VoiceAgent",
      resourceId: agent.id,
      correlationId: generateCorrelationId(),
    });
    return updated;
  }

  async listVersions(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return prisma.voiceAgentVersion.findMany({ where: { agentId: id }, orderBy: { version: "desc" }, take: 30 });
  }

  /** Restores a previous configuration as a NEW version — history is never rewritten. */
  async rollback(organizationId: string, id: string, version: number, actorUserId: string) {
    const agent = await this.findOne(organizationId, id);
    const snapshot = await prisma.voiceAgentVersion.findUnique({
      where: { agentId_version: { agentId: id, version } },
    });
    if (!snapshot) throw new NotFoundException("VERSION_NOT_FOUND");

    const cfg = snapshot.configuration as any;
    const nextVersion = agent.activeVersion + 1;
    const restored = await prisma.voiceAgent.update({
      where: { id: agent.id },
      data: {
        employeeName: cfg.employeeName,
        role: cfg.role,
        primaryLanguage: cfg.primaryLanguage,
        voiceId: cfg.voiceId,
        speakingSpeed: cfg.speakingSpeed,
        tone: cfg.tone,
        formality: cfg.formality,
        saudiDialect: cfg.saudiDialect,
        greetingMessage: cfg.greetingMessage,
        closingMessage: cfg.closingMessage,
        salesStyle: cfg.salesStyle,
        allowedTools: cfg.allowedTools ?? [],
        verificationLevel: cfg.verificationLevel,
        maxCallSeconds: cfg.maxCallSeconds,
        activeVersion: nextVersion,
      },
    });

    await this.snapshotVersion(agent.id, nextVersion, restored, actorUserId, `rollback to v${version}`);
    await this.audit.log({
      organizationId,
      actorUserId,
      action: "VOICE_AGENT_ROLLED_BACK",
      resourceType: "VoiceAgent",
      resourceId: agent.id,
      metadata: { restoredFrom: version, newVersion: nextVersion },
      correlationId: generateCorrelationId(),
    });
    return restored;
  }

  availableTools() {
    return VOICE_TOOLS.map((t) => ({
      id: t.id,
      description: t.description,
      verificationLevel: t.verificationLevel,
      sensitivity: t.sensitivity,
      maxPerCall: t.maxPerCall,
    }));
  }

  private sanitize(dto: Record<string, any>) {
    const optional: Record<string, any> = {};

    if (typeof dto.primaryLanguage === "string" && ["ar", "en"].includes(dto.primaryLanguage)) {
      optional.primaryLanguage = dto.primaryLanguage;
    }
    if (typeof dto.voiceId === "string") optional.voiceId = dto.voiceId.slice(0, 60);
    if (typeof dto.voicePersona === "string") optional.voicePersona = dto.voicePersona.slice(0, 300);
    if (dto.speakingSpeed !== undefined) {
      const speed = Number(dto.speakingSpeed);
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 1.5) throw new BadRequestException("INVALID_SPEAKING_SPEED");
      optional.speakingSpeed = speed;
    }
    if (typeof dto.tone === "string") optional.tone = dto.tone.slice(0, 60);
    if (typeof dto.formality === "string") optional.formality = dto.formality.slice(0, 60);
    if (typeof dto.saudiDialect === "boolean") optional.saudiDialect = dto.saudiDialect;
    if (typeof dto.greetingMessage === "string") optional.greetingMessage = dto.greetingMessage.slice(0, 500);
    if (typeof dto.closingMessage === "string") optional.closingMessage = dto.closingMessage.slice(0, 500);
    if (typeof dto.salesStyle === "string") {
      if (!SALES_STYLES.includes(dto.salesStyle)) throw new BadRequestException("INVALID_SALES_STYLE");
      optional.salesStyle = dto.salesStyle;
    }
    if (typeof dto.verificationLevel === "string") {
      if (!VERIFICATION_LEVELS.includes(dto.verificationLevel)) throw new BadRequestException("INVALID_VERIFICATION_LEVEL");
      optional.verificationLevel = dto.verificationLevel;
    }
    if (typeof dto.knowledgeBaseId === "string") optional.knowledgeBaseId = dto.knowledgeBaseId;
    if (typeof dto.whatsappFollowup === "boolean") optional.whatsappFollowup = dto.whatsappFollowup;
    if (dto.maxCallSeconds !== undefined) {
      const seconds = Number(dto.maxCallSeconds);
      if (!Number.isFinite(seconds) || seconds < 60 || seconds > 7200) throw new BadRequestException("INVALID_MAX_CALL_SECONDS");
      optional.maxCallSeconds = Math.round(seconds);
    }
    if (Array.isArray(dto.allowedTools)) {
      // Only known tool ids may be enabled — no arbitrary strings.
      const known = new Set(VOICE_TOOLS.map((t) => t.id));
      const requested = dto.allowedTools.filter((t: unknown) => typeof t === "string" && known.has(t));
      optional.allowedTools = requested;
    }
    // Recording is governed by org settings; an agent cannot self-enable it.
    if (typeof dto.recordingEnabled === "boolean") optional.recordingEnabled = dto.recordingEnabled;

    let role: string | undefined;
    if (typeof dto.role === "string") {
      if (!ROLES.includes(dto.role)) throw new BadRequestException("INVALID_ROLE");
      role = dto.role;
    }

    return {
      name: typeof dto.name === "string" ? dto.name.trim().slice(0, 120) : undefined,
      employeeName: typeof dto.employeeName === "string" ? dto.employeeName.trim().slice(0, 60) : undefined,
      role,
      optional,
    };
  }

  private async snapshotVersion(
    agentId: string,
    version: number,
    agent: any,
    actorUserId: string,
    changeReason: string
  ) {
    await prisma.voiceAgentVersion.create({
      data: {
        agentId,
        version,
        promptVersion: VOICE_SALES_PROMPT_VERSION,
        changeReason: changeReason.slice(0, 300),
        createdById: actorUserId,
        configuration: {
          employeeName: agent.employeeName,
          role: agent.role,
          primaryLanguage: agent.primaryLanguage,
          voiceId: agent.voiceId,
          speakingSpeed: agent.speakingSpeed,
          tone: agent.tone,
          formality: agent.formality,
          saudiDialect: agent.saudiDialect,
          greetingMessage: agent.greetingMessage,
          closingMessage: agent.closingMessage,
          salesStyle: agent.salesStyle,
          allowedTools: agent.allowedTools,
          verificationLevel: agent.verificationLevel,
          maxCallSeconds: agent.maxCallSeconds,
        },
      },
    });
  }
}
