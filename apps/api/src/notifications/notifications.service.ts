import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";

@Injectable()
export class NotificationsService {
  async findByUser(userId: string, organizationId: string): Promise<any> { return prisma.notification.findMany({ where: { userId, organizationId }, orderBy: { createdAt: "desc" }, take: 50 }); }
  async markAsRead(id: string): Promise<any> { return prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } }); }
  async markAllAsRead(userId: string, organizationId: string): Promise<any> { return prisma.notification.updateMany({ where: { userId, organizationId, isRead: false }, data: { isRead: true, readAt: new Date() } }); }
  async create(data: { organizationId: string; userId: string; type: string; title: string; content?: string; metadata?: any }): Promise<any> { return prisma.notification.create({ data }); }
}
