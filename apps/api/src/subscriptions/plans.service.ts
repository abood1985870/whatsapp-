import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";

/** Reserved PlanFeature keys the pricing engine and UI parse specially. */
export const MESSAGES_KEY = "whatsapp.messages.included";
export const USERS_KEY = "users.included";
export const STORAGE_KEY = "storage.included.mb";
const NUMERIC_KEYS = [MESSAGES_KEY, USERS_KEY, STORAGE_KEY];

@Injectable()
export class PlansService {
  /** Landing page + plan picker. Only what a prospective customer should see — no cost/margin data lives on this model. */
  async listPublic() {
    const plans = await prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      include: { prices: { where: { isActive: true } }, features: true },
      orderBy: { sortOrder: "asc" },
    });
    return plans.map(this.toDto);
  }

  /** Platform Owner — every plan, including hidden/disabled ones. */
  async listAll() {
    const plans = await prisma.plan.findMany({
      include: { prices: true, features: true },
      orderBy: { sortOrder: "asc" },
    });
    return plans.map(this.toDto);
  }

  async getOne(id: string) {
    const plan = await prisma.plan.findUnique({ where: { id }, include: { prices: true, features: true } });
    if (!plan) throw new NotFoundException("PLAN_NOT_FOUND");
    return this.toDto(plan);
  }

  async create(dto: any) {
    return prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          tagline: dto.tagline ?? null,
          badge: dto.badge ?? null,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
          isPublic: dto.isPublic ?? true,
        },
      });
      await this.writePriceAndFeatures(tx, plan.id, dto);
      const full = await tx.plan.findUnique({ where: { id: plan.id }, include: { prices: true, features: true } });
      return this.toDto(full!);
    });
  }

  async update(id: string, dto: any) {
    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("PLAN_NOT_FOUND");

    return prisma.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description ?? undefined,
          tagline: dto.tagline ?? undefined,
          badge: dto.badge === undefined ? undefined : dto.badge,
          sortOrder: dto.sortOrder ?? undefined,
          isActive: dto.isActive ?? undefined,
          isPublic: dto.isPublic ?? undefined,
        },
      });
      if (dto.priceAmount !== undefined || dto.features !== undefined || dto.messagesIncluded !== undefined) {
        await this.writePriceAndFeatures(tx, id, dto);
      }
      const full = await tx.plan.findUnique({ where: { id }, include: { prices: true, features: true } });
      return this.toDto(full!);
    });
  }

  /**
   * A plan edit never touches history: existing SubscriptionRequest/Subscription
   * rows carry their own `planSnapshot` frozen at request/approval time, so
   * changing a price or feature list here only affects future requests.
   */
  private async writePriceAndFeatures(tx: any, planId: string, dto: any) {
    if (dto.priceAmount !== undefined) {
      const currentPrice = await tx.planPrice.findFirst({ where: { planId, interval: "MONTH" } });
      if (currentPrice) {
        await tx.planPrice.update({ where: { id: currentPrice.id }, data: { amount: dto.priceAmount, isActive: true } });
      } else {
        await tx.planPrice.create({ data: { planId, amount: dto.priceAmount, interval: "MONTH", currency: dto.currency ?? "SAR" } });
      }
    }

    if (dto.messagesIncluded !== undefined) {
      await tx.planFeature.upsert({
        where: { planId_featureKey: { planId, featureKey: MESSAGES_KEY } },
        create: { planId, featureKey: MESSAGES_KEY, limit: dto.messagesIncluded },
        update: { limit: dto.messagesIncluded },
      });
    }
    if (dto.usersIncluded !== undefined) {
      await tx.planFeature.upsert({
        where: { planId_featureKey: { planId, featureKey: USERS_KEY } },
        create: { planId, featureKey: USERS_KEY, limit: dto.usersIncluded },
        update: { limit: dto.usersIncluded },
      });
    }
    if (dto.storageIncludedMb !== undefined) {
      await tx.planFeature.upsert({
        where: { planId_featureKey: { planId, featureKey: STORAGE_KEY } },
        create: { planId, featureKey: STORAGE_KEY, limit: dto.storageIncludedMb },
        update: { limit: dto.storageIncludedMb },
      });
    }
    if (Array.isArray(dto.features)) {
      // Marketing bullet points (arbitrary Arabic labels), replaced wholesale.
      // Numeric keys are untouched — they are written above from dedicated fields.
      await tx.planFeature.deleteMany({ where: { planId, featureKey: { notIn: NUMERIC_KEYS } } });
      for (const label of dto.features as string[]) {
        await tx.planFeature.create({ data: { planId, featureKey: label, isEnabled: true } });
      }
    }
  }

  private toDto(plan: any) {
    const monthly = plan.prices?.find((p: any) => p.interval === "MONTH" && p.isActive) ?? plan.prices?.[0];
    const messagesFeature = plan.features?.find((f: any) => f.featureKey === MESSAGES_KEY);
    const usersFeature = plan.features?.find((f: any) => f.featureKey === USERS_KEY);
    const storageFeature = plan.features?.find((f: any) => f.featureKey === STORAGE_KEY);
    const bullets = (plan.features ?? [])
      .filter((f: any) => !NUMERIC_KEYS.includes(f.featureKey) && f.isEnabled)
      .map((f: any) => f.featureKey);

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      tagline: plan.tagline,
      badge: plan.badge,
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      priceAmount: monthly?.amount ?? 0,
      currency: monthly?.currency ?? "SAR",
      interval: monthly?.interval ?? "MONTH",
      messagesIncluded: messagesFeature?.limit ?? null,
      usersIncluded: usersFeature?.limit ?? null,
      storageIncludedMb: storageFeature?.limit ?? null,
      features: bullets,
    };
  }
}
