import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { processAgentTurn } from "@qanoai/ai";

@Injectable()
export class AiAgentsService {
  /**
   * An AI agent carries the tenant's system prompt, its business rules and the
   * knowledge it is allowed to answer from — the configuration a competitor
   * would most want to read, and the one an attacker would most want to edit.
   * Every id-addressed method below proves ownership before touching anything.
   *
   * The inner queries then derive their organization from the verified agent,
   * so they stay correct without repeating the predicate everywhere.
   */
  private async assertOwned(id: string, organizationId: string) {
    const agent = await prisma.aiAgent.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    return agent;
  }

  async findAll(organizationId: string): Promise<any> { 
    return prisma.aiAgent.findMany({ 
      where: { organizationId, deletedAt: null }, 
      include: { creator: { select: { id: true, name: true } }, versions: { orderBy: { version: "desc" }, take: 5 } } 
    }); 
  }
  
  async findOne(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ 
      where: { id }, 
      include: { 
        versions: true, 
        creator: { select: { id: true, name: true } }
      } 
    });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    return agent;
  }
  
  async create(data: any): Promise<any> { 
    return prisma.aiAgent.create({ 
      data: { 
        organizationId: data.organizationId, 
        name: data.name, 
        description: data.description, 
        defaultLanguage: data.defaultLanguage || "ar", 
        tone: data.tone || "PROFESSIONAL", 
        systemInstructions: data.systemInstructions, 
        greetingMessage: data.greetingMessage, 
        fallbackMessage: data.fallbackMessage, 
        handoffMessage: data.handoffMessage, 
        supportPhoneNumber: data.supportPhoneNumber,
        autoLearningEnabled: data.autoLearningEnabled ?? false,
        learningScope: data.learningScope || "AGENT",
        confidenceThreshold: data.confidenceThreshold || 0.7, 
        autoReplyEnabled: data.autoReplyEnabled ?? true, 
        createdById: data.createdById 
      } 
    }); 
  }
  
  async update(id: string, organizationId: string, data: any): Promise<any> {
    await this.assertOwned(id, organizationId); 
    return prisma.aiAgent.update({ 
      where: { id }, 
      data: { 
        name: data.name, 
        description: data.description, 
        tone: data.tone, 
        systemInstructions: data.systemInstructions, 
        greetingMessage: data.greetingMessage, 
        fallbackMessage: data.fallbackMessage, 
        handoffMessage: data.handoffMessage, 
        supportPhoneNumber: data.supportPhoneNumber,
        autoLearningEnabled: data.autoLearningEnabled,
        learningScope: data.learningScope,
        confidenceThreshold: data.confidenceThreshold, 
        autoReplyEnabled: data.autoReplyEnabled, 
        suggestionsEnabled: data.suggestionsEnabled, 
        workingHoursOnly: data.workingHoursOnly 
      } 
    }); 
  }
  
  async publish(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    const latestVersion = await prisma.aiAgentVersion.findFirst({ where: { agentId: id }, orderBy: { version: "desc" } });
    const nextVersion = (latestVersion?.version || 0) + 1;
    const version = await prisma.aiAgentVersion.create({ 
      data: { 
        agentId: id, 
        version: nextVersion, 
        name: agent.name, 
        instructions: agent.systemInstructions, 
        configuration: {
          tone: agent.tone,
          confidenceThreshold: agent.confidenceThreshold,
          autoReplyEnabled: agent.autoReplyEnabled,
          supportPhoneNumber: agent.supportPhoneNumber,
          autoLearningEnabled: agent.autoLearningEnabled,
          learningScope: agent.learningScope
        }, 
        status: "ACTIVE", 
        publishedAt: new Date() 
      } 
    });
    await prisma.aiAgent.update({ where: { id }, data: { status: "ACTIVE", activeVersionId: version.id } });
    return version;
  }

  async listVersions(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    return prisma.aiAgentVersion.findMany({ where: { agentId: id }, orderBy: { version: "desc" } });
  }

  async rollback(id: string, organizationId: string, versionId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const version = await prisma.aiAgentVersion.findUnique({ where: { id: versionId } });
    if (!version || version.agentId !== id) throw new NotFoundException("VERSION_NOT_FOUND");
    
    // Copy the config from the selected version back to the agent drafts
    const config = version.configuration as any;
    await prisma.aiAgent.update({
      where: { id },
      data: {
        systemInstructions: version.instructions,
        tone: config.tone,
        confidenceThreshold: config.confidenceThreshold,
        autoReplyEnabled: config.autoReplyEnabled,
        supportPhoneNumber: config.supportPhoneNumber,
        autoLearningEnabled: config.autoLearningEnabled,
        learningScope: config.learningScope,
        activeVersionId: version.id
      }
    });
    return { success: true, rolledBackTo: version.version };
  }

  async cloneAgent(id: string, organizationId: string, userId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ where: { id }, include: { } });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    
    return prisma.aiAgent.create({
      data: {
        organizationId: agent.organizationId,
        name: `${agent.name} (Copy)`,
        description: agent.description,
        defaultLanguage: agent.defaultLanguage,
        tone: agent.tone,
        systemInstructions: agent.systemInstructions,
        greetingMessage: agent.greetingMessage,
        fallbackMessage: agent.fallbackMessage,
        handoffMessage: agent.handoffMessage,
        supportPhoneNumber: agent.supportPhoneNumber,
        autoLearningEnabled: agent.autoLearningEnabled,
        learningScope: agent.learningScope,
        confidenceThreshold: agent.confidenceThreshold,
        autoReplyEnabled: false, // Don't auto-enable copies
        createdById: userId,
        status: "DRAFT",
      }
    });
  }

  async testAgent(id: string, organizationId: string, input: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");

    const startedAt = Date.now();
    const response = await processAgentTurn({
      organizationId: agent.organizationId,
      conversationId: `test-${generateCorrelationId()}`,
      agentId: id,
      message: input
    });

    return {
      agentId: id,
      input,
      decision: response.decision,
      output: response.replyMessage,
      confidence: response.confidence,
      reason: response.reason,
      latencyMs: Date.now() - startedAt
    };
  }

  async listRuns(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    return prisma.aiRun.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async listFeedback(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    return prisma.aiFeedback.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" }
    });
  }

  async submitFeedback(id: string, organizationId: string, dto: any, userId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    if (!dto.runId) throw new BadRequestException("RUN_ID_REQUIRED");
    const run = await prisma.aiRun.findUnique({ where: { id: dto.runId } });
    if (!run || run.agentId !== id) throw new NotFoundException("RUN_NOT_FOUND");

    return prisma.aiFeedback.create({
      data: {
        runId: dto.runId,
        rating: dto.rating,
        comment: dto.comment,
        isCorrect: dto.isCorrect,
        correctedAnswer: dto.correctedAnswer,
        organizationId: run.organizationId,
        conversationId: run.conversationId,
        createdById: userId,
        agentId: id
      }
    });
  }

  async listEvaluationCases(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ where: { id }, select: { organizationId: true } });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    return prisma.evaluationCase.findMany({
      where: { organizationId: agent.organizationId, isActive: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async runEvaluation(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    if (!agent.activeVersionId) throw new BadRequestException("AGENT_NOT_PUBLISHED");

    const cases = await prisma.evaluationCase.findMany({ where: { organizationId: agent.organizationId, isActive: true } });

    const results: any[] = [];
    for (const testCase of cases) {
      const response = await processAgentTurn({
        organizationId: agent.organizationId,
        conversationId: `eval-${testCase.id}`,
        agentId: id,
        message: testCase.input
      });
      const passed = testCase.expectedAction
        ? response.decision === testCase.expectedAction
        : response.confidence >= (agent.confidenceThreshold || 0.7);
      results.push({ caseId: testCase.id, decision: response.decision, output: response.replyMessage, confidence: response.confidence, passed });
    }

    const passCount = results.filter(r => r.passed).length;
    const metrics = { totalCases: results.length, passed: passCount, passRate: results.length ? passCount / results.length : 0 };

    return prisma.evaluationRun.create({
      data: {
        organizationId: agent.organizationId,
        agentVersionId: agent.activeVersionId,
        status: "COMPLETED",
        results,
        metrics,
        completedAt: new Date()
      }
    });
  }

  async listPolicies(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    return prisma.agentPolicy.findMany({ where: { agentId: id } });
  }

  async createPolicy(id: string, organizationId: string, dto: any): Promise<any> {
    await this.assertOwned(id, organizationId);
    return prisma.agentPolicy.create({
      data: {
        agentId: id,
        policyType: dto.policyType,
        content: dto.content,
        isActive: dto.isActive ?? true
      }
    });
  }

  async listTools(id: string, organizationId: string): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ where: { id }, select: { organizationId: true } });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    return prisma.agentTool.findMany({ where: { organizationId: agent.organizationId } });
  }

  async registerTool(id: string, organizationId: string, dto: any): Promise<any> {
    await this.assertOwned(id, organizationId);
    const agent = await prisma.aiAgent.findUnique({ where: { id }, select: { organizationId: true } });
    if (!agent) throw new NotFoundException("AGENT_NOT_FOUND");
    return prisma.agentTool.create({
      data: {
        organizationId: agent.organizationId,
        name: dto.name,
        description: dto.description,
        configuration: dto.configuration,
        inputSchema: dto.inputSchema || {},
        riskLevel: dto.riskLevel || "LOW",
        isEnabled: dto.isActive ?? true,
        confirmationRequired: dto.riskLevel === "HIGH"
      }
    });
  }
}
