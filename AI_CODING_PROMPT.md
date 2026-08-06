# 🤖 AI CODING PROMPT — QanoAI WhatsAppSupport
## Complete the Application to 100% Without Human Intervention

---

## 📋 PROJECT OVERVIEW

**Project Name:** QanoAI WhatsAppSupport
**Type:** AI-powered WhatsApp customer support SaaS platform
**Architecture:** Modular monolith (NestJS API + Next.js Web + BullMQ Workers + Socket.IO Realtime)
**Database:** PostgreSQL with pgvector
**Current Completion:** ~85% (foundation + core API + basic UI)
**Goal:** 100% production-ready application

---

## 🎯 CRITICAL RULES FOR AI CODING AGENT

1. **DO NOT ask the user for clarification.** Make reasonable technical decisions.
2. **DO NOT leave TODO comments.** Implement everything fully.
3. **Follow existing code patterns.** Match the established architecture.
4. **Write production-quality code.** Include error handling, validation, logging.
5. **Write tests for every module.** Unit tests + integration tests.
6. **All UI must support RTL Arabic.** Default language is Arabic (ar), fallback English (en).
7. **Every database query must include `organizationId` for tenant isolation.**
8. **Use the existing packages.** Do not install conflicting dependencies.
9. **Respect the monorepo structure.** Use workspace imports (`@qanoai/*`).
10. **Complete one phase before moving to the next.** Do not skip steps.

---

## 📁 PROJECT STRUCTURE (EXISTING)

```
qanoai-whatsappsupport/
├── apps/
│   ├── api/              ← NestJS backend (13 modules, needs completion)
│   ├── web/              ← Next.js frontend (basic pages, needs full dashboard)
│   ├── worker/           ← BullMQ workers (skeleton only)
│   └── realtime/         ← Socket.IO server (skeleton only)
├── packages/
│   ├── database/         ← Prisma client + seed script
│   ├── config/           ← Environment config with Zod
│   ├── shared/           ← Constants, types, utilities
│   ├── validation/       ← Zod schemas
│   ├── permissions/      ← RBAC constants
│   └── queue/            ← BullMQ queue definitions
├── prisma/
│   └── schema.prisma     ← 60+ models, complete
├── docker-compose.yml    ← Dev infrastructure
└── README.md
```

---

## ✅ ALREADY BUILT (DO NOT REWRITE)

### Backend (NestJS API)
- [x] Auth module (register, login, JWT)
- [x] Organizations module (CRUD, list)
- [x] WhatsApp module (Evolution API provider, QR, status, disconnect)
- [x] Conversations module (list, detail, assign, resolve)
- [x] Messages module (send, list, internal notes)
- [x] Contacts module (CRUD, search, phone normalization)
- [x] AI Agents module (create, update, publish version)
- [x] Knowledge module (bases, sources, FAQ)
- [x] Analytics module (dashboard metrics)
- [x] Webhooks module (Evolution webhook processor)
- [x] Notifications, Audit, Health modules
- [x] Guards: AuthGuard, OrganizationGuard, PermissionGuard
- [x] Common: exception filters, interceptors, decorators

### Frontend (Next.js)
- [x] Landing page (RTL Arabic)
- [x] Login / Register pages
- [x] Dashboard layout with sidebar
- [x] Inbox page (conversation list with filters)
- [x] Conversation detail page (chat UI)
- [x] Settings page (grid layout)
- [x] Placeholder pages for all routes
- [x] API client with interceptors
- [x] Auth hook

### Infrastructure
- [x] Docker Compose (PostgreSQL + Redis + MinIO + Evolution API)
- [x] 4 Dockerfiles (API, Worker, Realtime, Web)
- [x] Prisma schema (60+ models)
- [x] Seed script with demo data
- [x] Queue infrastructure (BullMQ)

---

## 🔴 PHASE 1: COMPLETE THE BACKEND API (Priority: CRITICAL)

### 1.1 Fix Missing Dependencies
The API package.json references `@nestjs/axios` but the WhatsApp module uses it. Ensure all NestJS packages are properly installed and the API builds successfully.

### 1.2 Complete Auth Module
- [ ] Add `POST /auth/forgot-password` — send reset email
- [ ] Add `POST /auth/reset-password` — reset with token
- [ ] Add `POST /auth/verify-email` — email verification
- [ ] Add `POST /auth/refresh` — refresh JWT token
- [ ] Add `POST /auth/logout` — invalidate session
- [ ] Add `POST /auth/2fa/setup` — TOTP setup
- [ ] Add `POST /auth/2fa/verify` — TOTP verification
- [ ] Add `POST /auth/2fa/disable` — disable 2FA

### 1.3 Complete Organizations Module
- [ ] Add `GET /organizations/:id/members` — list members with pagination
- [ ] Add `POST /organizations/:id/invite` — invite member by email
- [ ] Add `POST /organizations/:id/members/:membershipId` — update member role
- [ ] Add `DELETE /organizations/:id/members/:membershipId` — remove member
- [ ] Add `GET /organizations/:id/roles` — list roles
- [ ] Add `POST /organizations/:id/roles` — create custom role
- [ ] Add `PATCH /organizations/:id/roles/:roleId` — update role permissions
- [ ] Add `GET /organizations/:id/branches` — list branches
- [ ] Add `POST /organizations/:id/branches` — create branch
- [ ] Add `GET /organizations/:id/teams` — list teams
- [ ] Add `POST /organizations/:id/teams` — create team
- [ ] Add `GET /organizations/:id/routing-rules` — list routing rules
- [ ] Add `POST /organizations/:id/routing-rules` — create routing rule
- [ ] Add `GET /organizations/:id/working-hours` — list working hours
- [ ] Add `POST /organizations/:id/working-hours` — set working hours
- [ ] Add `GET /organizations/:id/holidays` — list holidays
- [ ] Add `POST /organizations/:id/holidays` — add holiday
- [ ] Add `GET /organizations/:id/sla-policies` — list SLA policies
- [ ] Add `POST /organizations/:id/sla-policies` — create SLA policy

### 1.4 Complete WhatsApp Module
- [ ] Add `POST /whatsapp/connections/:id/reconnect` — reconnect instance
- [ ] Add `POST /whatsapp/connections/:id/webhook` — configure webhook
- [ ] Add `GET /whatsapp/connections/:id/health` — health check
- [ ] Add `POST /whatsapp/send-message` — send message via API (not just inbox)
- [ ] Add `POST /whatsapp/send-template` — send template message
- [ ] Add `POST /whatsapp/broadcast` — broadcast message (respect rate limits)
- [ ] Add media download endpoint for images/videos/documents
- [ ] Implement webhook status updates (sent, delivered, read, failed)

### 1.5 Complete Conversations Module
- [ ] Add `POST /conversations/:id/snooze` — snooze conversation
- [ ] Add `POST /conversations/:id/unsnooze` — unsnooze
- [ ] Add `POST /conversations/:id/close` — close conversation
- [ ] Add `POST /conversations/:id/reopen` — reopen conversation
- [ ] Add `POST /conversations/:id/block` — block spam
- [ ] Add `POST /conversations/:id/tags` — add tags
- [ ] Add `DELETE /conversations/:id/tags/:tagId` — remove tag
- [ ] Add `POST /conversations/:id/watch` — watch conversation
- [ ] Add `DELETE /conversations/:id/watch` — unwatch
- [ ] Add `GET /conversations/:id/history` — assignment history
- [ ] Add `GET /conversations/:id/notes` — internal notes
- [ ] Add conversation merge functionality
- [ ] Add bulk actions (assign multiple, close multiple, tag multiple)
- [ ] Add conversation export (CSV/JSON)

### 1.6 Complete Messages Module
- [ ] Add `POST /messages/media` — upload and send media
- [ ] Add `POST /messages/template` — send template message
- [ ] Add `POST /messages/:id/retry` — retry failed message
- [ ] Add `DELETE /messages/:id` — soft delete message
- [ ] Add message search endpoint
- [ ] Add message status webhook handler
- [ ] Implement media upload to MinIO/S3
- [ ] Implement media download from WhatsApp to storage

### 1.7 Complete Contacts Module
- [ ] Add `POST /contacts/:id/tags` — add tags to contact
- [ ] Add `DELETE /contacts/:id/tags/:tagId` — remove tag
- [ ] Add `POST /contacts/:id/custom-fields` — add custom field
- [ ] Add `PATCH /contacts/:id/custom-fields/:fieldId` — update custom field
- [ ] Add `POST /contacts/import` — CSV import
- [ ] Add `GET /contacts/export` — CSV export
- [ ] Add contact merge functionality
- [ ] Add contact activity timeline

### 1.8 Complete AI Agents Module
- [ ] Add `POST /ai-agents/:id/test` — test agent with sample input
- [ ] Add `GET /ai-agents/:id/versions` — list all versions
- [ ] Add `POST /ai-agents/:id/versions/:versionId/rollback` — rollback
- [ ] Add `POST /ai-agents/:id/clone` — clone agent
- [ ] Add `GET /ai-agents/:id/runs` — list AI runs
- [ ] Add `GET /ai-agents/:id/feedback` — list feedback
- [ ] Add `POST /ai-agents/:id/feedback` — submit feedback
- [ ] Add `GET /ai-agents/:id/evaluation` — evaluation cases
- [ ] Add `POST /ai-agents/:id/evaluation` — run evaluation
- [ ] Add prompt version management
- [ ] Add agent policy management (privacy, escalation, tool policies)
- [ ] Add agent tool registry and execution

### 1.9 Complete Knowledge Module
- [ ] Add `POST /knowledge/sources/:id/process` — trigger document processing
- [ ] Add `GET /knowledge/sources/:id/status` — check processing status
- [ ] Add `POST /knowledge/search` — semantic search with pgvector
- [ ] Add `POST /knowledge/ingest-url` — ingest from URL (with SSRF protection)
- [ ] Add `POST /knowledge/ingest-website` — website import (respect robots.txt)
- [ ] Add `GET /knowledge/categories` — list categories
- [ ] Add `POST /knowledge/categories` — create category
- [ ] Add document chunk management
- [ ] Add embedding generation pipeline (OpenAI text-embedding-3-small)
- [ ] Add knowledge snapshot/backup

### 1.10 Complete Analytics Module
- [ ] Add conversation metrics endpoint (volume, resolution time, first response time)
- [ ] Add agent performance endpoint (response time, resolution rate, CSAT)
- [ ] Add AI performance endpoint (accuracy, confidence, handoff rate)
- [ ] Add team performance endpoint
- [ ] Add peak hours analysis
- [ ] Add customer satisfaction metrics
- [ ] Add exportable reports (PDF/CSV)
- [ ] Add scheduled reports

### 1.11 Add Missing Modules
- [ ] **Billing Module** — subscriptions, plans, invoices, payments, usage tracking
- [ ] **Integrations Module** — n8n webhooks, API keys, outbound webhooks
- [ ] **Super Admin Module** — platform-wide management (organizations, feature flags, support access)
- [ ] **CSAT Module** — surveys, responses, metrics
- [ ] **Data Export/Deletion Module** — GDPR compliance
- [ ] **File Upload Module** — secure file handling with virus scanning placeholder

---

## 🔴 PHASE 2: AI PIPELINE (Priority: CRITICAL)

### 2.1 OpenAI Integration
- [ ] Create `@qanoai/ai` package with OpenAI client
- [ ] Implement chat completion with streaming
- [ ] Implement embedding generation
- [ ] Add request timeout handling (30s default)
- [ ] Add retry logic with exponential backoff
- [ ] Add cost tracking per request
- [ ] Add token usage tracking

### 2.2 RAG Pipeline
- [ ] Implement semantic search using pgvector
- [ ] Implement hybrid search (semantic + keyword + FAQ)
- [ ] Add context assembly from retrieved chunks
- [ ] Add citation tracking (source_id, chunk_id, page_number)
- [ ] Add retrieval logging

### 2.3 AI Response Generation
- [ ] Build conversation context window (last 10 messages)
- [ ] Build system prompt with agent instructions
- [ ] Build RAG context from knowledge base
- [ ] Implement agent decision logic (REPLY, ASK_CLARIFICATION, CALL_TOOL, HANDOFF, NO_REPLY)
- [ ] Implement confidence scoring
- [ ] Implement handoff logic (low confidence, sensitive topic, customer request)
- [ ] Add after-hours detection and response
- [ ] Add working hours check
- [ ] Add language detection and response matching

### 2.4 Tool Registry
- [ ] Implement tool registration system
- [ ] Implement tool execution with approval workflow
- [ ] Add tool risk levels (LOW, MEDIUM, HIGH)
- [ ] Add tool confirmation for HIGH risk
- [ ] Add tool execution logging

### 2.5 Safety & Guardrails
- [ ] Implement prompt injection detection
- [ ] Implement PII detection and masking
- [ ] Implement max action limits (5 actions per conversation)
- [ ] Implement rate limiting per organization
- [ ] Add content moderation

---

## 🔴 PHASE 3: WORKERS (Priority: CRITICAL)

### 3.1 WhatsApp Incoming Worker
- [ ] Process webhook events from queue
- [ ] Validate and deduplicate events
- [ ] Create/update contacts
- [ ] Create/update conversations
- [ ] Store incoming messages
- [ ] Trigger AI response if mode is AI_AUTOMATIC
- [ ] Handle media downloads

### 3.2 WhatsApp Outgoing Worker
- [ ] Send messages via Evolution API
- [ ] Handle rate limiting
- [ ] Update message status (sent, delivered, read, failed)
- [ ] Retry failed messages (max 3 attempts)
- [ ] Handle media uploads

### 3.3 AI Response Worker
- [ ] Generate AI responses using OpenAI
- [ ] Retrieve context from RAG
- [ ] Make agent decisions
- [ ] Send replies via outgoing queue
- [ ] Log AI runs with metrics

### 3.4 Document Ingestion Worker
- [ ] Extract text from PDF, DOCX, TXT, CSV
- [ ] Chunk documents (max 500 tokens per chunk)
- [ ] Generate embeddings
- [ ] Store chunks in pgvector
- [ ] Update ingestion job status

### 3.5 Conversation Summary Worker
- [ ] Generate conversation summaries using AI
- [ ] Update conversation summary field
- [ ] Trigger on conversation close

### 3.6 Usage Aggregation Worker
- [ ] Aggregate usage events daily
- [ ] Update entitlement usage
- [ ] Check plan limits
- [ ] Send limit warnings

### 3.7 Scheduled Reports Worker
- [ ] Generate scheduled reports
- [ ] Send reports via email
- [ ] Store report results

### 3.8 Cleanup Worker
- [ ] Soft delete expired data
- [ ] Archive old conversations
- [ ] Clean up failed webhooks
- [ ] Rotate audit logs

### 3.9 Dead Letter Queue Worker
- [ ] Process failed jobs from dead letter queue
- [ ] Alert on persistent failures
- [ ] Implement exponential backoff

---

## 🔴 PHASE 4: REALTIME SERVER (Priority: HIGH)

### 4.1 Authentication
- [ ] Verify JWT token on connection
- [ ] Reject unauthorized connections
- [ ] Associate socket with user

### 4.2 Organization Rooms
- [ ] Auto-join user to their organization rooms
- [ ] Broadcast new messages to organization
- [ ] Broadcast conversation updates
- [ ] Broadcast notifications

### 4.3 Conversation Rooms
- [ ] Join/leave conversation rooms
- [ ] Broadcast typing indicators
- [ ] Broadcast presence status
- [ ] Broadcast message read receipts

### 4.4 Events to Broadcast
- [ ] `conversation:new` — new conversation created
- [ ] `conversation:updated` — conversation status/mode changed
- [ ] `message:new` — new message received/sent
- [ ] `message:status` — message status changed
- [ ] `notification:new` — new notification
- [ ] `typing` — user typing indicator
- [ ] `presence` — user online/offline

---

## 🔴 PHASE 5: FRONTEND COMPLETION (Priority: HIGH)

### 5.1 Fix Build Issues
- [ ] Ensure all imports resolve correctly
- [ ] Fix Tailwind config for custom colors
- [ ] Ensure Next.js App Router works properly
- [ ] Add `next-env.d.ts`

### 5.2 Complete Inbox
- [ ] Add real-time updates via Socket.IO
- [ ] Add typing indicators
- [ ] Add message read receipts
- [ ] Add infinite scroll for messages
- [ ] Add conversation actions (assign, snooze, close, block)
- [ ] Add quick replies
- [ ] Add AI suggestions panel
- [ ] Add contact sidebar in conversation view
- [ ] Add internal notes with @mentions
- [ ] Add conversation tags
- [ ] Add conversation merge UI
- [ ] Add bulk actions UI

### 5.3 Complete Contacts Page
- [ ] Contact list with search and filters
- [ ] Contact detail view
- [ ] Contact edit form
- [ ] Contact tags management
- [ ] Custom fields management
- [ ] Contact import (CSV upload)
- [ ] Contact export
- [ ] Contact activity timeline
- [ ] Contact merge UI

### 5.4 Complete WhatsApp Page
- [ ] Connection list with status indicators
- [ ] QR code display modal
- [ ] Connection health monitoring
- [ ] Webhook configuration
- [ ] Connection analytics
- [ ] Broadcast message composer
- [ ] Template message management

### 5.5 Complete AI Agents Page
- [ ] Agent list with status
- [ ] Agent creation wizard
- [ ] Agent configuration form (tone, instructions, messages)
- [ ] Agent testing panel
- [ ] Version history with rollback
- [ ] Feedback review
- [ ] Evaluation results
- [ ] Prompt editor with variables

### 5.6 Complete Knowledge Base Page
- [ ] Knowledge base list
- [ ] Source upload (drag & drop)
- [ ] Source management (view, delete, reprocess)
- [ ] FAQ editor
- [ ] Search testing panel
- [ ] Ingestion status monitoring
- [ ] Category management

### 5.7 Complete Analytics Page
- [ ] Dashboard with KPI cards
- [ ] Conversation volume chart
- [ ] Response time chart
- [ ] AI performance chart
- [ ] Team performance table
- [ ] Peak hours heatmap
- [ ] CSAT score display
- [ ] Export reports button

### 5.8 Complete Settings Pages
- [ ] **Organization Settings** — name, logo, timezone, locale, currency
- [ ] **Members Settings** — invite, roles, permissions, remove
- [ ] **WhatsApp Settings** — connections, webhooks
- [ ] **AI Settings** — agent config, fallback messages
- [ ] **Security Settings** — password change, 2FA, sessions
- [ ] **Notifications Settings** — email, in-app preferences
- [ ] **Working Hours** — schedule editor, holidays
- [ ] **Billing Settings** — plan, usage, invoices, payment method
- [ ] **Audit Log** — filterable log viewer

### 5.9 Complete Super Admin Panel
- [ ] Organizations list with status
- [ ] Organization detail view
- [ ] Feature flags management
- [ ] Support access grants
- [ ] Platform analytics
- [ ] System health dashboard

### 5.10 UI/UX Polish
- [ ] Add loading skeletons
- [ ] Add error boundaries
- [ ] Add toast notifications
- [ ] Add confirmation dialogs
- [ ] Add empty states
- [ ] Ensure mobile responsiveness
- [ ] Add dark mode support
- [ ] Add keyboard shortcuts
- [ ] Add RTL support verification

---

## 🔴 PHASE 6: TESTING (Priority: HIGH)

### 6.1 Unit Tests
- [ ] Test all services (100% coverage goal)
- [ ] Test all controllers
- [ ] Test all guards
- [ ] Test utility functions

### 6.2 Integration Tests
- [ ] Test API endpoints
- [ ] Test database operations
- [ ] Test queue processing
- [ ] Test webhook handling

### 6.3 E2E Tests
- [ ] Test user registration flow
- [ ] Test login flow
- [ ] Test WhatsApp connection flow
- [ ] Test conversation flow
- [ ] Test AI response flow
- [ ] Test settings changes

### 6.4 Security Tests
- [ ] Test SQL injection resistance
- [ ] Test XSS resistance
- [ ] Test CSRF protection
- [ ] Test authentication bypass
- [ ] Test authorization bypass
- [ ] Test rate limiting
- [ ] Test file upload security

---

## 🔴 PHASE 7: DEVOPS & DOCUMENTATION (Priority: MEDIUM)

### 7.1 Scripts
- [ ] Create `start-qanoai.cmd` for Windows
- [ ] Create `stop-qanoai.cmd` for Windows
- [ ] Create `status-qanoai.cmd` for Windows
- [ ] Create backup script
- [ ] Create restore script
- [ ] Create update script

### 7.2 Documentation
- [ ] Complete API documentation (OpenAPI/Swagger)
- [ ] Write deployment guide
- [ ] Write troubleshooting guide
- [ ] Write developer onboarding guide
- [ ] Write security checklist

### 7.3 Production Readiness
- [ ] Add health checks to all services
- [ ] Add graceful shutdown handling
- [ ] Add request logging
- [ ] Add error tracking (Sentry placeholder)
- [ ] Add metrics collection (Prometheus placeholder)

---

## 🎨 DESIGN SYSTEM REQUIREMENTS

### Colors
- Primary: `#D4AF37` (Gold)
- Background: `#1A1D23` (Charcoal 900)
- Surface: `#FFFFFF`
- Text Primary: `#1A1D23`
- Text Secondary: `#6B7280`
- Success: `#22C55E`
- Warning: `#F59E0B`
- Error: `#EF4444`
- Info: `#3B82F6`

### Typography
- Font: Inter + Noto Sans Arabic
- RTL by default
- Font sizes: xs (12px), sm (14px), base (16px), lg (18px), xl (20px), 2xl (24px)

### Spacing
- Base unit: 4px
- Common: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64

---

## 📊 DATABASE MODELS REFERENCE

Key models (already in schema.prisma):
- User, Session, Account, Verification, TwoFactorCredential
- Organization, Membership, Invitation, Role, Permission, RolePermission
- Branch, Team, RoutingRule, WorkingHours, Holiday, SlaPolicy
- ChannelConnection, WhatsAppInstance, ProviderCredential
- WebhookEvent
- Contact, Tag, ContactTag, ContactCustomFieldDefinition, ContactCustomFieldValue
- Conversation, Message, MediaAsset, InternalNote, ConversationMention, ConversationWatcher, AssignmentHistory
- AiAgent, AiAgentVersion, PromptVersion, AgentPolicy, AgentTool, ToolExecution
- KnowledgeBase, KnowledgeSource, Document, DocumentVersion, DocumentChunk, IngestionJob, FaqEntry
- AiRun, AiFeedback, EvaluationCase, EvaluationRun
- Notification, NotificationPreference
- Plan, PlanPrice, PlanFeature, Subscription, Entitlement, UsageEvent, UsageAggregate, Invoice, Payment, Credit
- Integration, ApiKey, OutboundWebhookEndpoint, OutboundWebhookDelivery
- AuditLog, FeatureFlag, ScheduledReport, ReportRun
- CsatSurvey, CsatResponse
- DataExportRequest, DataDeletionRequest
- SecurityEvent, SupportAccessGrant

---

## 🔑 ENVIRONMENT VARIABLES

Required in `.env`:
```
NODE_ENV=development
DATABASE_URL=postgresql://qanoai:qanoai_dev_password@localhost:5432/qanoai?schema=public
REDIS_URL=redis://localhost:6379
AUTH_SECRET=minimum-32-characters-random-string
AUTH_ENCRYPTION_KEY=minimum-32-characters-random-string
CREDENTIAL_ENCRYPTION_KEY=minimum-32-characters-random-string
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key
OPENAI_API_KEY=sk-your-openai-key
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=qanoai-minio
S3_SECRET_ACCESS_KEY=qanoai-minio-password
```

---

## ⚠️ KNOWN LIMITATIONS TO ADDRESS

1. **QR Connector**: Uses Evolution API (unofficial WhatsApp Web), not official Meta Cloud API. Must handle reconnection gracefully.
2. **File Uploads**: Need virus scanning placeholder and secure storage.
3. **Billing**: Behind feature flag, needs payment gateway integration.
4. **n8n Integration**: Behind feature flag, optional.
5. **Voice Notes**: Transcription not implemented.
6. **Website Import**: Needs crawler with robots.txt respect.

---

## 🚀 EXECUTION ORDER

1. Fix API build errors and missing dependencies
2. Complete all API endpoints (Phase 1)
3. Implement AI pipeline (Phase 2)
4. Implement all workers (Phase 3)
5. Complete Realtime server (Phase 4)
6. Complete Frontend pages (Phase 5)
7. Write all tests (Phase 6)
8. Add DevOps scripts and docs (Phase 7)

**DO NOT SKIP PHASES. Complete each phase fully before moving to the next.**

---

## ✅ COMPLETION CRITERIA

The project is 100% complete when:
- [ ] All API endpoints return correct responses
- [ ] All frontend pages render correctly in RTL Arabic
- [ ] WhatsApp QR connection works end-to-end
- [ ] AI responds automatically to incoming messages
- [ ] Real-time updates work via Socket.IO
- [ ] All workers process jobs correctly
- [ ] All tests pass (unit + integration + E2E)
- [ ] Docker Compose starts all services successfully
- [ ] Seed script creates valid demo data
- [ ] No TODO comments remain in code
- [ ] README is accurate and complete

---

**END OF PROMPT — START CODING NOW**
