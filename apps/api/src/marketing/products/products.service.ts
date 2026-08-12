import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { createProductSchema, updateProductSchema } from "@qanoai/validation";
import { AuditService } from "../../audit/audit.service";

const PLATFORM_MAX_DISCOUNT_PERCENT = 5;

@Injectable()
export class ProductsService {
  constructor(private readonly audit: AuditService) {}

  async list(organizationId: string, includeInactive = false) {
    return prisma.salesProduct.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const product = await prisma.salesProduct.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!product) throw new NotFoundException("PRODUCT_NOT_FOUND");
    return product;
  }

  async create(dto: unknown, actorUserId: string) {
    const parsed = createProductSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const slug = data.slug || this.slugify(data.nameEnglish || data.nameArabic);
    const existing = await prisma.salesProduct.findUnique({
      where: { organizationId_slug: { organizationId: data.organizationId, slug } },
    });
    if (existing && !existing.deletedAt) throw new BadRequestException("PRODUCT_SLUG_EXISTS");

    const product = await prisma.salesProduct.create({
      data: {
        ...data,
        slug,
        maxDiscountPercent: Math.min(data.maxDiscountPercent, PLATFORM_MAX_DISCOUNT_PERCENT),
      },
    });

    await this.audit.log({
      organizationId: data.organizationId,
      actorUserId,
      action: "MARKETING_PRODUCT_CREATED",
      resourceType: "SalesProduct",
      resourceId: product.id,
      afterData: { nameArabic: product.nameArabic, priceMinor: product.priceMinor, slug: product.slug },
      correlationId: generateCorrelationId(),
    });

    return product;
  }

  async update(organizationId: string, id: string, dto: unknown, actorUserId: string) {
    const parsed = updateProductSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const before = await this.findOne(organizationId, id);

    const product = await prisma.salesProduct.update({
      where: { id: before.id },
      data: {
        ...data,
        ...(data.maxDiscountPercent !== undefined
          ? { maxDiscountPercent: Math.min(data.maxDiscountPercent, PLATFORM_MAX_DISCOUNT_PERCENT) }
          : {}),
      },
    });

    const priceChanged = data.priceMinor !== undefined && data.priceMinor !== before.priceMinor;
    await this.audit.log({
      organizationId,
      actorUserId,
      action: priceChanged ? "MARKETING_PRODUCT_PRICE_CHANGED" : "MARKETING_PRODUCT_UPDATED",
      resourceType: "SalesProduct",
      resourceId: product.id,
      beforeData: { priceMinor: before.priceMinor, active: before.active },
      afterData: { priceMinor: product.priceMinor, active: product.active },
      correlationId: generateCorrelationId(),
    });

    return product;
  }

  async softDelete(organizationId: string, id: string, actorUserId: string) {
    const before = await this.findOne(organizationId, id);
    const product = await prisma.salesProduct.update({
      where: { id: before.id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.log({
      organizationId,
      actorUserId,
      action: "MARKETING_PRODUCT_DELETED",
      resourceType: "SalesProduct",
      resourceId: id,
      correlationId: generateCorrelationId(),
    });
    return product;
  }

  /**
   * The ONLY price authority for the AI sales layer. Callers must never
   * take a price from prompts, websites, or model output.
   */
  async getAuthoritativePrice(organizationId: string, productId: string) {
    const product = await this.findOne(organizationId, productId);
    return {
      productId: product.id,
      priceMinor: product.priceMinor,
      currency: product.currency,
      maxDiscountPercent: Math.min(product.maxDiscountPercent, PLATFORM_MAX_DISCOUNT_PERCENT),
    };
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return base && /[a-z0-9]/.test(base) ? base.replace(/[^a-z0-9-]/g, "") || this.randomSlug() : this.randomSlug();
  }

  private randomSlug(): string {
    return `product-${Math.random().toString(36).slice(2, 8)}`;
  }
}
