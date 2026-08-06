import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";

@Injectable()
export class AuditService {
  async findByOrganization(organizationId: string, page: number, limit: number): Promise<any> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, skip, take: limit, include: { actorUser: { select: { id: true, name: true, email: true } } } }),
      prisma.auditLog.count({ where: { organizationId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  async log(data: { organizationId?: string; actorUserId?: string; action: string; resourceType: string; resourceId?: string; beforeData?: any; afterData?: any; metadata?: any; correlationId: string }): Promise<any> { return prisma.auditLog.create({ data }); }
}
