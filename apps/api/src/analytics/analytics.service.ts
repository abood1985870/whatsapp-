import { Injectable, BadRequestException } from "@nestjs/common";
import { prisma } from "@qanoai/database";

@Injectable()
export class AnalyticsService {
  async getDashboard(organizationId: string, from?: string, to?: string): Promise<any> {
    const dateFilter: any = { organizationId };
    if (from || to) { 
      dateFilter.createdAt = {}; 
      if (from) dateFilter.createdAt.gte = new Date(from); 
      if (to) dateFilter.createdAt.lte = new Date(to); 
    }
    const [totalConversations, activeConversations, resolvedConversations, totalMessages, avgResponseTime, handoffCount, activeContacts] = await Promise.all([
      prisma.conversation.count({ where: dateFilter }),
      prisma.conversation.count({ where: { ...dateFilter, status: { in: ["NEW", "OPEN", "WAITING_FOR_AGENT", "WAITING_FOR_CUSTOMER"] } } }),
      prisma.conversation.count({ where: { ...dateFilter, status: "RESOLVED" } }),
      prisma.message.count({ where: { organizationId, createdAt: dateFilter.createdAt } }),
      prisma.conversation.aggregate({ where: dateFilter, _avg: { aiConfidence: true } }),
      prisma.conversation.count({ where: { ...dateFilter, handoffReason: { not: null } } }),
      prisma.contact.count({ where: { organizationId, status: "ACTIVE", deletedAt: null } }),
    ]);

    // Last 7 days of activity for the dashboard charts
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const daily: { date: string; conversations: number; aiReplies: number }[] = [];
    const [convRows, aiRows] = (await Promise.all([
      prisma.$queryRaw`SELECT date_trunc('day', "createdAt")::date AS day, count(*)::int AS n FROM conversations WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`SELECT date_trunc('day', "createdAt")::date AS day, count(*)::int AS n FROM messages WHERE "organizationId" = ${organizationId} AND "isAiGenerated" = true AND "createdAt" >= ${since} GROUP BY 1`,
    ])) as [any[], any[]];
    const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rowKey = (day: any) => day instanceof Date ? localKey(day) : String(day).slice(0, 10);
    for (let i = 0; i < 7; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = localKey(d);
      daily.push({
        date: key,
        conversations: convRows.find(r => rowKey(r.day) === key)?.n || 0,
        aiReplies: aiRows.find(r => rowKey(r.day) === key)?.n || 0,
      });
    }

    const resolutionRate = totalConversations ? Math.round((resolvedConversations / totalConversations) * 100) : 0;

    return { totalConversations, activeConversations, resolvedConversations, totalMessages, avgAiConfidence: avgResponseTime._avg.aiConfidence || 0, handoffCount, activeContacts, resolutionRate, daily };
  }

  async getConversationMetrics(organizationId: string, from?: string, to?: string): Promise<any> {
    const dateFilter: any = { organizationId };
    if (from || to) { 
      dateFilter.createdAt = {}; 
      if (from) dateFilter.createdAt.gte = new Date(from); 
      if (to) dateFilter.createdAt.lte = new Date(to); 
    }
    const byStatus = await prisma.conversation.groupBy({ by: ["status"], where: dateFilter, _count: { id: true } });
    const byMode = await prisma.conversation.groupBy({ by: ["mode"], where: dateFilter, _count: { id: true } });
    return { byStatus, byMode };
  }

  async getAgentMetrics(organizationId: string, from?: string, to?: string): Promise<any> {
    const dateFilter: any = { };
    if (from || to) { 
      dateFilter.createdAt = {}; 
      if (from) dateFilter.createdAt.gte = new Date(from); 
      if (to) dateFilter.createdAt.lte = new Date(to); 
    }

    const runs = await prisma.aiRun.findMany({
      where: {
        agent: { organizationId },
        ...dateFilter
      },
      include: { agent: { select: { id: true, name: true } } }
    });

    const agentStats: Record<string, any> = {};
    for (const run of runs) {
      if (!agentStats[run.agentId]) {
        agentStats[run.agentId] = { name: run.agent.name, totalRuns: 0, successfulRuns: 0, totalTokens: 0 };
      }
      agentStats[run.agentId].totalRuns++;
      if (run.status === "COMPLETED") agentStats[run.agentId].successfulRuns++;
      // tokenUsage is a Json column shaped { total: number }
      agentStats[run.agentId].totalTokens += ((run.tokenUsage as any)?.total || 0);
    }
    
    return Object.values(agentStats);
  }

  async getTeamMetrics(organizationId: string, from?: string, to?: string): Promise<any> {
    const dateFilter: any = { organizationId };
    if (from || to) { 
      dateFilter.createdAt = {}; 
      if (from) dateFilter.createdAt.gte = new Date(from); 
      if (to) dateFilter.createdAt.lte = new Date(to); 
    }

    const messages = await prisma.message.findMany({
      where: {
        organizationId,
        senderType: "HUMAN",
        ...dateFilter
      },
      include: {}
    });

    const teamStats: Record<string, any> = {};
    for (const msg of messages) {
      if (msg.senderMembershipId) {
        if (!teamStats[msg.senderMembershipId]) {
          teamStats[msg.senderMembershipId] = { 
            name: "Unknown", 
            messagesSent: 0 
          };
        }
        teamStats[msg.senderMembershipId].messagesSent++;
      }
    }
    
    return Object.values(teamStats);
  }

  async exportMetrics(organizationId: string, type: string, from?: string, to?: string): Promise<any> {
    if (type === "dashboard") {
      const stats = await this.getDashboard(organizationId, from, to);
      return `Metric,Value\nTotal Conversations,${stats.totalConversations}\nActive Conversations,${stats.activeConversations}\nResolved Conversations,${stats.resolvedConversations}\nTotal Messages,${stats.totalMessages}\nHandoff Count,${stats.handoffCount}\nAvg AI Confidence,${stats.avgAiConfidence}\n`;
    } else if (type === "agents") {
      const stats = await this.getAgentMetrics(organizationId, from, to);
      let csv = "Agent Name,Total Runs,Successful Runs,Total Tokens\n";
      for (const stat of stats) {
        csv += `"${stat.name}",${stat.totalRuns},${stat.successfulRuns},${stat.totalTokens}\n`;
      }
      return csv;
    } else if (type === "team") {
      const stats = await this.getTeamMetrics(organizationId, from, to);
      let csv = "Team Member,Messages Sent\n";
      for (const stat of stats) {
        csv += `"${stat.name}",${stat.messagesSent}\n`;
      }
      return csv;
    } else {
      throw new BadRequestException("INVALID_EXPORT_TYPE");
    }
  }
}
