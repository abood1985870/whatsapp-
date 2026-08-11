import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { AuditService } from "../../audit/audit.service";

/** Platform-wide hard ceiling. Nothing — prompt, product config, request payload — can exceed it. */
export const PLATFORM_MAX_DISCOUNT_PERCENT = 5;

export interface ComputedOffer {
  offerId: string;
  originalPriceMinor: number;
  discountPercent: number;
  discountAmountMinor: number;
  finalPriceMinor: number;
  currency: string;
}

/**
 * The ONLY discount authority. The AI layer can request an offer; the
 * numbers always come from here, computed in integer minor units from the
 * product's database price.
 */
@Injectable()
export class DiscountService {
  constructor(private readonly audit: AuditService) {}

  async computeOffer(input: {
    organizationId: string;
    leadId: string;
    productId: string;
    conversationId?: string;
    reason: string;
  }): Promise<ComputedOffer> {
    const product = await prisma.salesProduct.findFirst({
      where: { id: input.productId, organizationId: input.organizationId, deletedAt: null },
    });
    if (!product) throw new BadRequestException("PRODUCT_NOT_FOUND");

    const discountPercent = Math.max(0, Math.min(product.maxDiscountPercent, PLATFORM_MAX_DISCOUNT_PERCENT));
    const originalPriceMinor = product.priceMinor;
    // integer arithmetic; round the discount down so we never exceed the cap
    const discountAmountMinor = Math.floor((originalPriceMinor * discountPercent) / 100);
    const finalPriceMinor = originalPriceMinor - discountAmountMinor;

    const offer = await prisma.discountOffer.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        productId: input.productId,
        conversationId: input.conversationId ?? null,
        originalPriceMinor,
        discountPercent,
        discountAmountMinor,
        finalPriceMinor,
        reason: input.reason.slice(0, 500),
      },
    });

    await this.audit.log({
      organizationId: input.organizationId,
      action: "MARKETING_DISCOUNT_OFFERED",
      resourceType: "DiscountOffer",
      resourceId: offer.id,
      metadata: { leadId: input.leadId, productId: input.productId, discountPercent, finalPriceMinor },
      correlationId: generateCorrelationId(),
    });

    return {
      offerId: offer.id,
      originalPriceMinor,
      discountPercent,
      discountAmountMinor,
      finalPriceMinor,
      currency: product.currency,
    };
  }
}

/** Format integer halalas as a human Arabic SAR string ("2,500 ريال"). */
export function formatSarMinor(minor: number): string {
  const riyals = Math.floor(minor / 100);
  const halalas = minor % 100;
  const formatted = riyals.toLocaleString("en-US");
  return halalas > 0 ? `${formatted}.${String(halalas).padStart(2, "0")} ريال` : `${formatted} ريال`;
}
