import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";

@Injectable()
export class PricingService {
  /** Singleton-per-currency row, created lazily on first read so a fresh deploy has sane (zero) defaults instead of a 404. */
  async getCostConfig(currency = "SAR") {
    const existing = await prisma.pricingCostConfig.findUnique({ where: { currency } });
    if (existing) return existing;
    return prisma.pricingCostConfig.create({ data: { currency } });
  }

  async updateCostConfig(dto: any, userId: string, currency = "SAR") {
    const current = await this.getCostConfig(currency);
    return prisma.pricingCostConfig.update({
      where: { id: current.id },
      data: {
        whatsappCostPerMessage: dto.whatsappCostPerMessage ?? undefined,
        aiCostPerMessage: dto.aiCostPerMessage ?? undefined,
        infrastructureCost: dto.infrastructureCost ?? undefined,
        databaseCost: dto.databaseCost ?? undefined,
        storageCost: dto.storageCost ?? undefined,
        providerCost: dto.providerCost ?? undefined,
        supportCost: dto.supportCost ?? undefined,
        otherVariableCost: dto.otherVariableCost ?? undefined,
        safetyBufferPercent: dto.safetyBufferPercent ?? undefined,
        targetGrossMarginPercent: dto.targetGrossMarginPercent ?? undefined,
        updatedByUserId: userId,
      },
    });
  }

  /**
   * Price -> Fixed Costs Allocation -> Desired Profit -> Maximum Variable Cost
   * Budget -> Safe Included Messages, exactly the formula the owner specified.
   * Returns an estimate object; never throws on a loss-making plan — the
   * caller decides whether to warn, not to block.
   */
  estimate(plan: { priceAmount: number; messagesIncluded: number | null }, cost: any) {
    const costPerMessage = (cost.whatsappCostPerMessage ?? 0) + (cost.aiCostPerMessage ?? 0);
    const fixedCostsAllocation =
      (cost.infrastructureCost ?? 0) +
      (cost.databaseCost ?? 0) +
      (cost.storageCost ?? 0) +
      (cost.providerCost ?? 0) +
      (cost.supportCost ?? 0) +
      (cost.otherVariableCost ?? 0);
    const safetyBufferMultiplier = 1 + (cost.safetyBufferPercent ?? 0) / 100;

    const messagesIncluded = plan.messagesIncluded ?? 0;
    const variableCost = costPerMessage * messagesIncluded * safetyBufferMultiplier;
    const estimatedCustomerCost = fixedCostsAllocation + variableCost;
    const estimatedGrossProfit = plan.priceAmount - estimatedCustomerCost;
    const grossMarginPercent = plan.priceAmount > 0 ? (estimatedGrossProfit / plan.priceAmount) * 100 : 0;

    const targetMargin = cost.targetGrossMarginPercent ?? 65;
    const desiredProfit = plan.priceAmount * (targetMargin / 100);
    const maxVariableCostBudget = plan.priceAmount - fixedCostsAllocation - desiredProfit;
    const recommendedIncludedMessages =
      costPerMessage > 0 ? Math.max(0, Math.floor(maxVariableCostBudget / (costPerMessage * safetyBufferMultiplier))) : null;

    return {
      costPerMessage,
      costPer1000Messages: costPerMessage * 1000,
      fixedCostsAllocation,
      estimatedCustomerCost,
      monthlyRevenue: plan.priceAmount,
      estimatedGrossProfit,
      grossMarginPercent,
      recommendedIncludedMessages,
      isLoss: estimatedGrossProfit < 0,
      isBelowTargetMargin: grossMarginPercent < targetMargin,
      targetGrossMarginPercent: targetMargin,
    };
  }

  async marginReport() {
    const [plans, cost] = await Promise.all([
      prisma.plan.findMany({ include: { prices: true, features: true } }),
      this.getCostConfig(),
    ]);
    return plans.map((plan) => {
      const monthly = plan.prices.find((p) => p.interval === "MONTH" && p.isActive) ?? plan.prices[0];
      const messagesFeature = plan.features.find((f) => f.featureKey === "whatsapp.messages.included");
      const estimate = this.estimate(
        { priceAmount: monthly?.amount ?? 0, messagesIncluded: messagesFeature?.limit ?? null },
        cost
      );
      return { planId: plan.id, planName: plan.name, priceAmount: monthly?.amount ?? 0, ...estimate };
    });
  }
}
