-- AI Voice Employee module (الموظف الصوتي)
-- Strictly additive: creates new tables only. No existing table is altered or dropped.

CREATE TABLE "voice_agents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL DEFAULT 'سعود',
    "role" TEXT NOT NULL DEFAULT 'SALES',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "primaryLanguage" TEXT NOT NULL DEFAULT 'ar',
    "secondaryLanguages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "voiceId" TEXT NOT NULL DEFAULT 'alloy',
    "voicePersona" TEXT,
    "speakingSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "tone" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    "formality" TEXT NOT NULL DEFAULT 'BALANCED',
    "saudiDialect" BOOLEAN NOT NULL DEFAULT true,
    "greetingMessage" TEXT,
    "closingMessage" TEXT,
    "salesStyle" TEXT NOT NULL DEFAULT 'BALANCED',
    "knowledgeBaseId" TEXT,
    "allowedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationLevel" TEXT NOT NULL DEFAULT 'NO_VERIFICATION',
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappFollowup" BOOLEAN NOT NULL DEFAULT true,
    "maxCallSeconds" INTEGER NOT NULL DEFAULT 900,
    "promptVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "activeVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "voice_agents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_agents_organizationId_idx" ON "voice_agents"("organizationId");
CREATE INDEX "voice_agents_status_idx" ON "voice_agents"("status");

CREATE TABLE "voice_agent_versions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_agent_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_agent_versions_agentId_version_key" ON "voice_agent_versions"("agentId", "version");
CREATE INDEX "voice_agent_versions_agentId_idx" ON "voice_agent_versions"("agentId");

ALTER TABLE "voice_agent_versions" ADD CONSTRAINT "voice_agent_versions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "voice_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "voice_numbers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "voiceAgentId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'SA',
    "provider" TEXT NOT NULL,
    "providerNumberId" TEXT,
    "connectionType" TEXT NOT NULL DEFAULT 'EXISTING_FORWARDING',
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastVerifiedAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "monthlyCostMinor" INTEGER,
    "setupNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "voice_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_numbers_organizationId_normalizedPhone_key" ON "voice_numbers"("organizationId", "normalizedPhone");
CREATE INDEX "voice_numbers_organizationId_idx" ON "voice_numbers"("organizationId");
CREATE INDEX "voice_numbers_status_idx" ON "voice_numbers"("status");

CREATE TABLE "voice_provider_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_provider_configs_organizationId_provider_key" ON "voice_provider_configs"("organizationId", "provider");
CREATE INDEX "voice_provider_configs_organizationId_idx" ON "voice_provider_configs"("organizationId");

CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCallId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "voiceAgentId" TEXT,
    "voiceAgentVersion" INTEGER,
    "promptVersion" TEXT,
    "voiceNumberId" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "productId" TEXT,
    "campaignId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "normalizedFromPhone" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "status" TEXT NOT NULL DEFAULT 'RINGING',
    "endReason" TEXT,
    "errorCategory" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "structuredSummary" JSONB,
    "salesOutcome" TEXT,
    "supportRequired" BOOLEAN NOT NULL DEFAULT false,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recordingStorageKey" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "estimatedCostMinor" INTEGER NOT NULL DEFAULT 0,
    "actualCostMinor" INTEGER,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calls_provider_providerCallId_key" ON "calls"("provider", "providerCallId");
CREATE INDEX "calls_organizationId_idx" ON "calls"("organizationId");
CREATE INDEX "calls_status_idx" ON "calls"("status");
CREATE INDEX "calls_contactId_idx" ON "calls"("contactId");
CREATE INDEX "calls_leadId_idx" ON "calls"("leadId");
CREATE INDEX "calls_startedAt_idx" ON "calls"("startedAt");
CREATE INDEX "calls_normalizedFromPhone_idx" ON "calls"("normalizedFromPhone");

ALTER TABLE "calls" ADD CONSTRAINT "calls_voiceAgentId_fkey" FOREIGN KEY ("voiceAgentId") REFERENCES "voice_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "providerEventId" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_events_idempotencyKey_key" ON "call_events"("idempotencyKey");
CREATE INDEX "call_events_callId_idx" ON "call_events"("callId");
CREATE INDEX "call_events_createdAt_idx" ON "call_events"("createdAt");

ALTER TABLE "call_events" ADD CONSTRAINT "call_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "call_transcript_turns" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "redactedText" TEXT,
    "containsPii" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "startOffsetMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_transcript_turns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_transcript_turns_callId_turnIndex_key" ON "call_transcript_turns"("callId", "turnIndex");
CREATE INDEX "call_transcript_turns_callId_idx" ON "call_transcript_turns"("callId");

ALTER TABLE "call_transcript_turns" ADD CONSTRAINT "call_transcript_turns_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "call_tool_executions" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "denyReason" TEXT,
    "input" JSONB,
    "output" JSONB,
    "idempotencyKey" TEXT,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "call_tool_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_tool_executions_callId_idempotencyKey_key" ON "call_tool_executions"("callId", "idempotencyKey");
CREATE INDEX "call_tool_executions_callId_idx" ON "call_tool_executions"("callId");
CREATE INDEX "call_tool_executions_status_idx" ON "call_tool_executions"("status");

ALTER TABLE "call_tool_executions" ADD CONSTRAINT "call_tool_executions_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "voice_usage_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT,
    "periodKey" TEXT NOT NULL,
    "telephonySeconds" INTEGER NOT NULL DEFAULT 0,
    "aiAudioSeconds" INTEGER NOT NULL DEFAULT 0,
    "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMinor" INTEGER NOT NULL DEFAULT 0,
    "actualCostMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_usage_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_usage_records_organizationId_periodKey_idx" ON "voice_usage_records"("organizationId", "periodKey");
CREATE INDEX "voice_usage_records_callId_idx" ON "voice_usage_records"("callId");

CREATE TABLE "verification_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT,
    "contactId" TEXT,
    "scope" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_sessions_organizationId_idx" ON "verification_sessions"("organizationId");
CREATE INDEX "verification_sessions_callId_idx" ON "verification_sessions"("callId");
CREATE INDEX "verification_sessions_expiresAt_idx" ON "verification_sessions"("expiresAt");

CREATE TABLE "voice_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "killSwitchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "toolsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappFollowupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "otpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "numberProvisioningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "releaseStage" TEXT NOT NULL DEFAULT 'TEST',
    "maxConcurrentCalls" INTEGER NOT NULL DEFAULT 5,
    "maxCallSeconds" INTEGER NOT NULL DEFAULT 900,
    "silenceWarningSeconds" INTEGER NOT NULL DEFAULT 8,
    "silenceEndSeconds" INTEGER NOT NULL DEFAULT 25,
    "maxRepeatedFailures" INTEGER NOT NULL DEFAULT 3,
    "dailyBudgetMinor" INTEGER,
    "monthlyBudgetMinor" INTEGER,
    "transcriptRetentionDays" INTEGER,
    "recordingRetentionDays" INTEGER,
    "ownerAlertPhone" TEXT,
    "testPhoneNumber" TEXT,
    "businessHoursNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_settings_organizationId_key" ON "voice_settings"("organizationId");

CREATE TABLE "voice_evaluation_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "voiceAgentId" TEXT,
    "promptVersion" TEXT NOT NULL,
    "scenarioSetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "totalScenarios" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "voice_evaluation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_evaluation_runs_organizationId_idx" ON "voice_evaluation_runs"("organizationId");

CREATE TABLE "voice_evaluation_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION,
    "expected" JSONB,
    "actual" JSONB,
    "violations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_evaluation_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_evaluation_results_runId_idx" ON "voice_evaluation_results"("runId");

ALTER TABLE "voice_evaluation_results" ADD CONSTRAINT "voice_evaluation_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "voice_evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
