ALTER TABLE "ai_agents"
ADD COLUMN "supportPhoneNumber" TEXT,
ADD COLUMN "autoLearningEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "learningScope" TEXT NOT NULL DEFAULT 'AGENT';

ALTER TABLE "conversations"
ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "faq_entries"
ADD COLUMN "agentId" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "sourceConversationId" TEXT,
ADD COLUMN "sourceMessageId" TEXT;

CREATE INDEX "faq_entries_agentId_idx" ON "faq_entries"("agentId");
CREATE INDEX "faq_entries_sourceConversationId_idx" ON "faq_entries"("sourceConversationId");
