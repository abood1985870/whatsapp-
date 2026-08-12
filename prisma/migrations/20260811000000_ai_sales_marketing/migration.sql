-- AI Sales & Marketing module (التسويق والمبيعات)
-- Strictly additive: creates new tables only. No existing table is altered or dropped.

CREATE TABLE "sales_products" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nameArabic" TEXT NOT NULL,
    "nameEnglish" TEXT,
    "slug" TEXT NOT NULL,
    "shortDescription" TEXT,
    "fullDescription" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "targetCustomer" TEXT,
    "features" JSONB NOT NULL DEFAULT '[]',
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "painPoints" JSONB NOT NULL DEFAULT '[]',
    "salesTalkingPoints" JSONB NOT NULL DEFAULT '[]',
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "objectionGuidance" JSONB NOT NULL DEFAULT '[]',
    "productPageUrl" TEXT,
    "websiteUrl" TEXT,
    "storeUrl" TEXT,
    "purchaseUrl" TEXT,
    "demoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "aiSalesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxDiscountPercent" INTEGER NOT NULL DEFAULT 5,
    "knowledgeBaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_products_organizationId_slug_key" ON "sales_products"("organizationId", "slug");
CREATE INDEX "sales_products_organizationId_idx" ON "sales_products"("organizationId");
CREATE INDEX "sales_products_active_idx" ON "sales_products"("active");

CREATE TABLE "marketing_leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "rawPhone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "legacyNormalizedPhone" TEXT NOT NULL,
    "website" TEXT,
    "city" TEXT,
    "businessType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "providerId" TEXT,
    "providerRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "contactId" TEXT,
    "websiteProfileId" TEXT,
    "importId" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_leads_organizationId_normalizedPhone_key" ON "marketing_leads"("organizationId", "normalizedPhone");
CREATE INDEX "marketing_leads_organizationId_idx" ON "marketing_leads"("organizationId");
CREATE INDEX "marketing_leads_status_idx" ON "marketing_leads"("status");
CREATE INDEX "marketing_leads_legacyNormalizedPhone_idx" ON "marketing_leads"("legacyNormalizedPhone");
CREATE INDEX "marketing_leads_importId_idx" ON "marketing_leads"("importId");

CREATE TABLE "lead_state_transitions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_state_transitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_state_transitions_leadId_idx" ON "lead_state_transitions"("leadId");
CREATE INDEX "lead_state_transitions_createdAt_idx" ON "lead_state_transitions"("createdAt");

ALTER TABLE "lead_state_transitions" ADD CONSTRAINT "lead_state_transitions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dnc_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "addedById" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dnc_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dnc_entries_organizationId_normalizedPhone_key" ON "dnc_entries"("organizationId", "normalizedPhone");
CREATE INDEX "dnc_entries_organizationId_idx" ON "dnc_entries"("organizationId");
CREATE INDEX "dnc_entries_isActive_idx" ON "dnc_entries"("isActive");

CREATE TABLE "lead_imports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EXCEL_IMPORT',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "dncRows" INTEGER NOT NULL DEFAULT 0,
    "previouslyContactedRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_imports_organizationId_idx" ON "lead_imports"("organizationId");

CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "targetBusinessType" TEXT,
    "city" TEXT,
    "requestedLeadCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "salesContext" TEXT,
    "executionKey" TEXT,
    "channelConnectionId" TEXT,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "repliedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_campaigns_organizationId_idx" ON "marketing_campaigns"("organizationId");
CREATE INDEX "marketing_campaigns_status_idx" ON "marketing_campaigns"("status");

ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_productId_fkey" FOREIGN KEY ("productId") REFERENCES "sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "personalizationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "personalizedMessage" TEXT,
    "personalizationMeta" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "messageId" TEXT,
    "conversationId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaign_recipients_campaignId_leadId_isTest_key" ON "campaign_recipients"("campaignId", "leadId", "isTest");
CREATE INDEX "campaign_recipients_campaignId_status_idx" ON "campaign_recipients"("campaignId", "status");
CREATE INDEX "campaign_recipients_leadId_idx" ON "campaign_recipients"("leadId");
CREATE INDEX "campaign_recipients_conversationId_idx" ON "campaign_recipients"("conversationId");

ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "discount_offers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "conversationId" TEXT,
    "originalPriceMinor" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "discountAmountMinor" INTEGER NOT NULL,
    "finalPriceMinor" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discount_offers_organizationId_idx" ON "discount_offers"("organizationId");
CREATE INDEX "discount_offers_leadId_idx" ON "discount_offers"("leadId");

ALTER TABLE "discount_offers" ADD CONSTRAINT "discount_offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "custom_software_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "conversationId" TEXT,
    "companyActivity" TEXT,
    "problem" TEXT,
    "desiredSolution" TEXT,
    "keyFeatures" JSONB NOT NULL DEFAULT '[]',
    "contactDetails" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_software_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "custom_software_requests_organizationId_idx" ON "custom_software_requests"("organizationId");
CREATE INDEX "custom_software_requests_status_idx" ON "custom_software_requests"("status");

CREATE TABLE "website_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedHost" TEXT NOT NULL,
    "businessSummary" TEXT,
    "services" JSONB,
    "relevantContext" TEXT,
    "possiblePainPoints" JSONB,
    "productFit" TEXT,
    "fetchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "fetchedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "website_profiles_organizationId_idx" ON "website_profiles"("organizationId");
CREATE INDEX "website_profiles_normalizedHost_idx" ON "website_profiles"("normalizedHost");

CREATE TABLE "marketing_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "killSwitchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "testPhoneNumber" TEXT,
    "ownerHotLeadPhone" TEXT,
    "safeCampaignMode" BOOLEAN NOT NULL DEFAULT true,
    "defaultTone" TEXT NOT NULL DEFAULT 'SAUDI_PROFESSIONAL',
    "maxLeadsPerCampaign" INTEGER NOT NULL DEFAULT 500,
    "maxWebsiteAnalysesPerCampaign" INTEGER NOT NULL DEFAULT 200,
    "maxPersonalizationAttempts" INTEGER NOT NULL DEFAULT 2,
    "dailyAiBudgetMinor" INTEGER,
    "monthlyAiBudgetMinor" INTEGER,
    "discoveryProvider" TEXT NOT NULL DEFAULT 'MOCK',
    "sendDelaySeconds" INTEGER NOT NULL DEFAULT 3,
    "canaryMaxRecipients" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_settings_organizationId_key" ON "marketing_settings"("organizationId");

CREATE TABLE "hot_lead_alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT,
    "conversationId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hot_lead_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hot_lead_alerts_dedupKey_key" ON "hot_lead_alerts"("dedupKey");
CREATE INDEX "hot_lead_alerts_organizationId_idx" ON "hot_lead_alerts"("organizationId");
