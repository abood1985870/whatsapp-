import { z } from "zod";

// AI Sales & Marketing input schemas. Controllers parse these explicitly
// (the global ValidationPipe has no class-validator metadata to act on).

const trustedUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL must be http(s)");

export const createProductSchema = z.object({
  organizationId: z.string().min(1),
  nameArabic: z.string().trim().min(2).max(200),
  nameEnglish: z.string().trim().max(200).optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, dashes")
    .max(100)
    .optional(),
  shortDescription: z.string().trim().max(500).optional(),
  fullDescription: z.string().trim().max(10000).optional(),
  priceMinor: z.number().int().min(0).max(1_000_000_000),
  currency: z.enum(["SAR"]).default("SAR"),
  targetCustomer: z.string().trim().max(500).optional(),
  features: z.array(z.string().trim().max(500)).max(50).default([]),
  benefits: z.array(z.string().trim().max(500)).max(50).default([]),
  painPoints: z.array(z.string().trim().max(500)).max(50).default([]),
  salesTalkingPoints: z.array(z.string().trim().max(1000)).max(50).default([]),
  faqs: z
    .array(z.object({ question: z.string().trim().max(500), answer: z.string().trim().max(2000) }))
    .max(50)
    .default([]),
  objectionGuidance: z
    .array(z.object({ objection: z.string().trim().max(500), guidance: z.string().trim().max(2000) }))
    .max(50)
    .default([]),
  productPageUrl: trustedUrl.optional(),
  websiteUrl: trustedUrl.optional(),
  storeUrl: trustedUrl.optional(),
  purchaseUrl: trustedUrl.optional(),
  demoUrl: trustedUrl.optional(),
  active: z.boolean().default(true),
  aiSalesEnabled: z.boolean().default(true),
  maxDiscountPercent: z.number().int().min(0).max(5).default(5),
  knowledgeBaseId: z.string().optional(),
});

export const updateProductSchema = createProductSchema.partial().omit({ organizationId: true });

export const discoverLeadsSchema = z.object({
  organizationId: z.string().min(1),
  productId: z.string().min(1),
  businessType: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  requestedCount: z.number().int().min(1).max(500),
});

export const importLeadsSchema = z.object({
  organizationId: z.string().min(1),
  filename: z.string().trim().max(300),
  rows: z
    .array(
      z.object({
        name: z.string().trim().max(300).optional(),
        phone: z.string().trim().max(50).optional(),
        website: z.string().trim().max(500).optional(),
      })
    )
    .max(5000),
});

export const createCampaignSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2).max(200),
  productId: z.string().min(1),
  targetBusinessType: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  salesContext: z.string().trim().max(4000).optional(),
  channelConnectionId: z.string().optional(),
  leadIds: z.array(z.string()).max(5000).default([]),
});

export const dncAddSchema = z.object({
  organizationId: z.string().min(1),
  phone: z.string().trim().min(7).max(50),
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const updateMarketingSettingsSchema = z.object({
  organizationId: z.string().min(1),
  killSwitchEnabled: z.boolean().optional(),
  testPhoneNumber: z.string().trim().max(50).nullable().optional(),
  ownerHotLeadPhone: z.string().trim().max(50).nullable().optional(),
  safeCampaignMode: z.boolean().optional(),
  defaultTone: z.string().trim().max(100).optional(),
  maxLeadsPerCampaign: z.number().int().min(1).max(5000).optional(),
  maxWebsiteAnalysesPerCampaign: z.number().int().min(0).max(2000).optional(),
  maxPersonalizationAttempts: z.number().int().min(1).max(5).optional(),
  dailyAiBudgetMinor: z.number().int().min(0).nullable().optional(),
  monthlyAiBudgetMinor: z.number().int().min(0).nullable().optional(),
  discoveryProvider: z.enum(["MOCK", "GOOGLE_PLACES"]).optional(),
  sendDelaySeconds: z.number().int().min(1).max(120).optional(),
  canaryMaxRecipients: z.number().int().min(1).max(500).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type DiscoverLeadsInput = z.infer<typeof discoverLeadsSchema>;
export type ImportLeadsInput = z.infer<typeof importLeadsSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type DncAddInput = z.infer<typeof dncAddSchema>;
export type UpdateMarketingSettingsInput = z.infer<typeof updateMarketingSettingsSchema>;
