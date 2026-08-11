-- Outbound safety limits, enforced by OutboundGuardService.
-- All additive with defaults, so existing rows keep working unchanged.

ALTER TABLE "marketing_settings"
  ADD COLUMN IF NOT EXISTS "dailyOutboundCap" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS "perContactMinIntervalHours" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "quietHoursStart" INTEGER NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS "quietHoursEnd" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Distinguishes outbound marketing from a reply to a customer. The caps count
-- only marketing; applying them to support replies would stop an agent
-- answering a question at 10pm.
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "isMarketing" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: campaign sends are the marketing messages that already exist.
UPDATE "messages"
SET "isMarketing" = true
WHERE "isMarketing" = false
  AND "direction" = 'OUTBOUND'
  AND "metadata"->>'kind' = 'MARKETING_OUTREACH';

CREATE INDEX IF NOT EXISTS "messages_organizationId_isMarketing_createdAt_idx"
  ON "messages" ("organizationId", "isMarketing", "createdAt");
CREATE INDEX IF NOT EXISTS "messages_contactId_isMarketing_createdAt_idx"
  ON "messages" ("contactId", "isMarketing", "createdAt");
