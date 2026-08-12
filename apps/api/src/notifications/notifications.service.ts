import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";

@Injectable()
export class NotificationsService {
  /**
   * `organizationIds` comes from the caller's own memberships, never from the
   * request. An empty list means the caller belongs to no active organization,
   * and must match nothing — `{ in: [] }` does exactly that, whereas omitting
   * the filter would return every notification the user has ever had,
   * including from organizations they were removed from.
   */
  async findByUser(userId: string, organizationIds: string[]): Promise<any> {
    return prisma.notification.findMany({
      where: { userId, organizationId: { in: organizationIds } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /**
   * Scoped by userId so marking someone else's notification read is a no-op
   * rather than a successful write. `updateMany` is deliberate: `update`
   * would throw on a foreign id, which leaks whether that id exists.
   */
  async markAsRead(id: string, userId: string): Promise<any> {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string, organizationIds: string[]): Promise<any> {
    return prisma.notification.updateMany({
      where: { userId, organizationId: { in: organizationIds }, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async create(data: {
    organizationId: string;
    userId: string;
    type: string;
    title: string;
    content?: string;
    metadata?: any;
  }): Promise<any> {
    return prisma.notification.create({ data });
  }
}
