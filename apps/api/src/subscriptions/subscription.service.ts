import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";

@Injectable()
export class SubscriptionService {
  /**
   * Customer-facing widget data. Never returns cost/margin — those live only
   * behind PlatformOwnerGuard in PricingController.
   */
  async getCurrent(organizationId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== "ACTIVE") {
      const pending = await prisma.subscriptionRequest.findFirst({
        where: { organizationId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      });
      return {
        status: pending ? "PENDING" : subscription?.status ?? "NONE",
        pendingRequest: pending ?? null,
        subscription: null,
      };
    }

    const snapshot = (subscription.planSnapshot as any) ?? {};
    const messagesIncluded: number | null =
      snapshot.features?.find((f: any) => f.featureKey === "whatsapp.messages.included")?.limit ?? null;

    const usedAgg = await prisma.usageEvent.aggregate({
      where: {
        organizationId,
        featureKey: "whatsapp.messages",
        createdAt: { gte: subscription.currentPeriodStart, lt: subscription.currentPeriodEnd },
      },
      _sum: { quantity: true },
    });
    const used = usedAgg._sum.quantity ?? 0;
    const remaining = messagesIncluded !== null ? Math.max(0, messagesIncluded - used) : null;
    const usagePercent = messagesIncluded ? Math.min(100, Math.round((used / messagesIncluded) * 100)) : 0;

    return {
      status: "ACTIVE",
      subscription: {
        id: subscription.id,
        planName: snapshot.name ?? subscription.plan.name,
        priceAmount: snapshot.priceAmount ?? null,
        currency: snapshot.currency ?? "SAR",
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      usage: {
        included: messagesIncluded,
        used,
        remaining,
        usagePercent,
        warningLevel: usagePercent >= 100 ? "FULL" : usagePercent >= 90 ? "CRITICAL" : usagePercent >= 70 ? "WARNING" : "OK",
      },
      pendingRequest: null,
    };
  }
}
