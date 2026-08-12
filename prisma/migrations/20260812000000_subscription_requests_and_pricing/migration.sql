-- AlterTable
ALTER TABLE "plans" ADD COLUMN "tagline" TEXT;
ALTER TABLE "plans" ADD COLUMN "badge" TEXT;
ALTER TABLE "plans" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "planSnapshot" JSONB;
ALTER TABLE "subscriptions" ADD COLUMN "activationSource" TEXT NOT NULL DEFAULT 'MANUAL_APPROVAL';
ALTER TABLE "subscriptions" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "planSnapshot" JSONB NOT NULL,
    "priceAtRequest" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "contactName" TEXT NOT NULL,
    "contactCompany" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_cost_configs" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "whatsappCostPerMessage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiCostPerMessage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "infrastructureCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "databaseCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "providerCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supportCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherVariableCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safetyBufferPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "targetGrossMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 65,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "pricing_cost_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_requests_subscriptionId_key" ON "subscription_requests"("subscriptionId");
CREATE INDEX "subscription_requests_organizationId_idx" ON "subscription_requests"("organizationId");
CREATE INDEX "subscription_requests_status_idx" ON "subscription_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_cost_configs_currency_key" ON "pricing_cost_configs"("currency");

-- AddForeignKey
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
