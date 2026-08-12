import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma, Prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";

@Injectable()
export class SubscriptionRequestsService {
  async create(organizationId: string, requestedByUserId: string, dto: any) {
    const activeSubscription = await prisma.subscription.findUnique({ where: { organizationId } });
    if (activeSubscription?.status === "ACTIVE") {
      throw new ConflictException("ALREADY_SUBSCRIBED");
    }

    const pending = await prisma.subscriptionRequest.findFirst({ where: { organizationId, status: "PENDING" } });
    if (pending) throw new ConflictException("REQUEST_ALREADY_PENDING");

    const plan = await prisma.plan.findFirst({
      where: { id: dto.planId, isActive: true, isPublic: true },
      include: { prices: { where: { interval: "MONTH", isActive: true } }, features: true },
    });
    if (!plan) throw new BadRequestException("PLAN_NOT_FOUND");
    const price = plan.prices[0];
    if (!price) throw new BadRequestException("PLAN_HAS_NO_ACTIVE_PRICE");

    const contactEmail = String(dto.contactEmail || "").trim();
    const contactName = String(dto.contactName || "").trim();
    if (!contactEmail || !contactName) throw new BadRequestException("CONTACT_NAME_AND_EMAIL_REQUIRED");

    const planSnapshot = {
      name: plan.name,
      description: plan.description,
      tagline: plan.tagline,
      badge: plan.badge,
      priceAmount: price.amount,
      currency: price.currency,
      interval: price.interval,
      features: plan.features.map((f) => ({ featureKey: f.featureKey, limit: f.limit, isEnabled: f.isEnabled })),
    };

    const request = await prisma.subscriptionRequest.create({
      data: {
        organizationId,
        planId: plan.id,
        requestedByUserId,
        status: "PENDING",
        planSnapshot,
        priceAtRequest: price.amount,
        currency: price.currency,
        contactName,
        contactCompany: dto.contactCompany ?? null,
        contactEmail,
        contactPhone: dto.contactPhone ?? null,
        notes: dto.notes ?? null,
      },
    });

    const correlationId = generateCorrelationId();
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: requestedByUserId,
        action: "SUBSCRIPTION_REQUESTED",
        resourceType: "SubscriptionRequest",
        resourceId: request.id,
        afterData: { planId: plan.id, planName: plan.name, priceAtRequest: price.amount },
        correlationId,
      },
    });

    await this.notifyPlatformOwners({
      type: "SUBSCRIPTION_REQUEST_CREATED",
      title: "طلب اشتراك جديد",
      content: `${contactName} (${plan.name}) — بانتظار المراجعة`,
      metadata: { subscriptionRequestId: request.id },
    });

    return request;
  }

  async listMine(organizationId: string) {
    return prisma.subscriptionRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
  }

  async listAll(filters: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { contactName: { contains: filters.search, mode: "insensitive" } },
        { contactCompany: { contains: filters.search, mode: "insensitive" } },
        { contactEmail: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const [items, total, counts] = await Promise.all([
      prisma.subscriptionRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { organization: { select: { displayName: true, legalName: true } }, plan: { select: { name: true } } },
      }),
      prisma.subscriptionRequest.count({ where }),
      this.statusCounts(),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), counts };
  }

  private async statusCounts() {
    const rows = await prisma.subscriptionRequest.groupBy({ by: ["status"], _count: { status: true } });
    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
    for (const r of rows) counts[r.status] = r._count.status;
    return counts;
  }

  async getOne(id: string) {
    const request = await prisma.subscriptionRequest.findUnique({
      where: { id },
      include: { organization: true, plan: { include: { prices: true, features: true } } },
    });
    if (!request) throw new NotFoundException("SUBSCRIPTION_REQUEST_NOT_FOUND");
    return request;
  }

  async approve(id: string, approvedByUserId: string) {
    const correlationId = generateCorrelationId();
    const { request, subscription } = await prisma.$transaction(async (tx) => {
      const req = await tx.subscriptionRequest.findUnique({ where: { id } });
      if (!req) throw new NotFoundException("SUBSCRIPTION_REQUEST_NOT_FOUND");
      if (req.status !== "PENDING") throw new ConflictException("REQUEST_ALREADY_PROCESSED");

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const existingSub = await tx.subscription.findUnique({ where: { organizationId: req.organizationId } });
      const subData = {
        organizationId: req.organizationId,
        planId: req.planId,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        planSnapshot: req.planSnapshot as any,
        activationSource: "MANUAL_APPROVAL",
      };
      const sub = existingSub
        ? await tx.subscription.update({ where: { id: existingSub.id }, data: subData })
        : await tx.subscription.create({ data: subData });

      const updatedReq = await tx.subscriptionRequest.update({
        where: { id },
        data: { status: "APPROVED", approvedByUserId, approvedAt: now, subscriptionId: sub.id },
      });

      await tx.auditLog.create({
        data: {
          organizationId: req.organizationId,
          actorUserId: approvedByUserId,
          action: "SUBSCRIPTION_REQUEST_APPROVED",
          resourceType: "SubscriptionRequest",
          resourceId: id,
          beforeData: { status: "PENDING" },
          afterData: { status: "APPROVED", subscriptionId: sub.id },
          correlationId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.organizationId,
          actorUserId: approvedByUserId,
          action: "SUBSCRIPTION_ACTIVATED",
          resourceType: "Subscription",
          resourceId: sub.id,
          beforeData: existingSub ? { status: existingSub.status } : Prisma.JsonNull,
          afterData: { status: "ACTIVE", planId: req.planId },
          correlationId,
        },
      });

      return { request: updatedReq, subscription: sub };
    });

    await this.notifyOrganization(request.organizationId, {
      type: "SUBSCRIPTION_APPROVED",
      title: "تم تفعيل اشتراكك",
      content: "تمت الموافقة على طلب اشتراكك — الباقة فعّالة الآن.",
      metadata: { subscriptionId: subscription.id },
    });

    return request;
  }

  async reject(id: string, rejectedByUserId: string, reason?: string) {
    const correlationId = generateCorrelationId();
    const request = await prisma.$transaction(async (tx) => {
      const req = await tx.subscriptionRequest.findUnique({ where: { id } });
      if (!req) throw new NotFoundException("SUBSCRIPTION_REQUEST_NOT_FOUND");
      if (req.status !== "PENDING") throw new ConflictException("REQUEST_ALREADY_PROCESSED");

      const updated = await tx.subscriptionRequest.update({
        where: { id },
        data: { status: "REJECTED", rejectionReason: reason ?? null },
      });

      await tx.auditLog.create({
        data: {
          organizationId: req.organizationId,
          actorUserId: rejectedByUserId,
          action: "SUBSCRIPTION_REQUEST_REJECTED",
          resourceType: "SubscriptionRequest",
          resourceId: id,
          beforeData: { status: "PENDING" },
          afterData: { status: "REJECTED" },
          metadata: reason ? { rejectionReason: reason } : undefined,
          correlationId,
        },
      });

      return updated;
    });

    await this.notifyOrganization(request.organizationId, {
      type: "SUBSCRIPTION_REJECTED",
      title: "لم تتم الموافقة على طلب الاشتراك",
      content: "راجع تفاصيل طلبك أو تواصل معنا لمزيد من المعلومات.",
    });

    return request;
  }

  private async notifyPlatformOwners(data: { type: string; title: string; content?: string; metadata?: any }) {
    const owners = await prisma.membership.findMany({
      where: { status: "ACTIVE", role: { isSystem: true, organizationId: null, name: "PLATFORM_SUPER_ADMIN" } },
      select: { userId: true, organizationId: true },
    });
    await Promise.all(
      owners.map((o) =>
        prisma.notification.create({
          data: { organizationId: o.organizationId, userId: o.userId, ...data },
        })
      )
    ).catch(() => {});
  }

  private async notifyOrganization(organizationId: string, data: { type: string; title: string; content?: string; metadata?: any }) {
    const members = await prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { userId: true },
    });
    await Promise.all(
      members.map((m) => prisma.notification.create({ data: { organizationId, userId: m.userId, ...data } }))
    ).catch(() => {});
  }
}
