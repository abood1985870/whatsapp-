# QanoAI WhatsAppSupport — AI Coding Prompt

## Context
You are completing a production SaaS platform for AI-powered WhatsApp customer support. The foundation (85%) is already built. Your job is to implement the remaining 15% to reach 100%.

## Architecture
- Backend: NestJS (TypeScript) with Prisma ORM
- Frontend: Next.js 14 App Router with Tailwind CSS
- Workers: BullMQ with Redis
- Realtime: Socket.IO
- Database: PostgreSQL with pgvector
- AI: OpenAI GPT-4o-mini + embeddings
- WhatsApp: Evolution API (Baileys-based)

## Rules
1. NEVER ask the user for clarification. Make decisions.
2. NEVER leave TODO comments. Implement fully.
3. Match existing code patterns exactly.
4. Every DB query MUST include organizationId.
5. All UI MUST support RTL Arabic (default language).
6. Write tests for every new module.
7. Use workspace imports: @qanoai/*
8. Complete phases in order. Do not skip.

## Execution Order

### Phase 1: Complete Backend API
- Auth: forgot-password, reset-password, 2FA, refresh token
- Organizations: members, roles, branches, teams, routing, working hours, SLA
- WhatsApp: reconnect, webhook config, send template, broadcast, media
- Conversations: snooze, close, reopen, block, tags, watch, merge, bulk actions, export
- Messages: media upload, template, retry, delete, search
- Contacts: tags, custom fields, import/export, merge, timeline
- AI Agents: test, versions, rollback, clone, runs, feedback, evaluation, tools
- Knowledge: process, search, URL ingest, website import, categories, snapshots
- Analytics: conversation metrics, agent performance, AI performance, team performance, peak hours, CSAT, reports
- New modules: Billing, Integrations, Super Admin, CSAT, Data Export/Deletion

### Phase 2: AI Pipeline
- OpenAI client with streaming, retries, cost tracking
- RAG: semantic search (pgvector), hybrid search, citations
- AI Response: context window, system prompt, RAG context, decision logic, confidence, handoff
- Tool Registry: registration, execution, approval workflow, risk levels
- Safety: prompt injection detection, PII masking, rate limits, content moderation

### Phase 3: Workers
- WhatsApp Incoming: process webhooks, create contacts/conversations, trigger AI
- WhatsApp Outgoing: send messages, handle status, retry failed
- AI Response: generate replies, RAG retrieval, send via queue
- Document Ingestion: extract text, chunk, embed, store
- Conversation Summary: generate summaries on close
- Usage Aggregation: daily aggregation, limit checks
- Scheduled Reports: generate and email reports
- Cleanup: soft delete, archive, rotate logs
- Dead Letter: handle persistent failures

### Phase 4: Realtime Server
- JWT authentication on connection
- Organization rooms (broadcast messages, conversations, notifications)
- Conversation rooms (typing indicators, read receipts, presence)

### Phase 5: Frontend
- Fix build issues
- Inbox: real-time updates, typing, read receipts, infinite scroll, actions, AI suggestions, contact sidebar, notes, tags, merge, bulk
- Contacts: list, search, detail, edit, tags, custom fields, import/export, timeline, merge
- WhatsApp: connections, QR modal, health, broadcast, templates
- AI Agents: list, wizard, config, testing, versions, feedback, evaluation
- Knowledge: bases, upload, sources, FAQ, search test, categories
- Analytics: dashboard, charts, tables, heatmap, CSAT, export
- Settings: organization, members, WhatsApp, AI, security, notifications, working hours, billing, audit
- Super Admin: organizations, feature flags, support access, platform analytics
- Polish: skeletons, errors, toasts, confirmations, empty states, mobile, dark mode, keyboard shortcuts

### Phase 6: Testing
- Unit tests (100% coverage goal)
- Integration tests (API, DB, queues, webhooks)
- E2E tests (registration, login, WhatsApp, conversation, AI, settings)
- Security tests (SQL injection, XSS, CSRF, auth bypass, rate limiting)

### Phase 7: DevOps
- Windows scripts (start, stop, status)
- Backup, restore, update scripts
- Complete documentation
- Health checks, graceful shutdown, logging, monitoring placeholders

## Completion Criteria
All API endpoints work. All pages render in RTL Arabic. WhatsApp QR connects. AI auto-responds. Realtime updates work. All tests pass. Docker starts everything. No TODOs remain.

## START NOW. DO NOT ASK QUESTIONS.
