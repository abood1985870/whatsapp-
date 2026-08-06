import { prisma } from '@qanoai/database';

export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  execute: (args: any, context: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async executeTool(name: string, args: any, context: any) {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    if (tool.requiresApproval || tool.riskLevel === 'HIGH') {
      // In a real flow, this would pause execution and notify a human
      return { status: 'PENDING_APPROVAL', message: 'Tool execution requires human approval.' };
    }

    try {
      const result = await tool.execute(args, context);
      
      // Log execution (Assuming ToolExecution table exists or similar tracking mechanism)
      // We will skip strict prisma.toolExecution.create since we are mocking this in Phase 2
      // but ideally we log it here.
      
      return { status: 'SUCCESS', result };
    } catch (error: any) {
      return { status: 'ERROR', error: error.message };
    }
  }

  getOpenAITools() {
    return this.getAll().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
