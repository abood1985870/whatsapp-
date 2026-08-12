# Enterprise AI Sales & Smart Marketing — Implementation Plan

Feature: التسويق والمبيعات بالذكاء الاصطناعي
Branch: `feature/enterprise-ai-sales` (base `07220ed`)
Status doc: see `docs/AI_SALES_BASELINE.md` for baseline evidence.

---

## 1. Existing architecture (verified by reconnaissance)

- Monorepo: Turborepo + pnpm. `apps/api` (NestJS, `/v1/*`), `apps/web` (Next 14 App Router, RTL Arabic, axios), `apps/worker` (BullMQ processors), `apps/realtime` (socket.io :3002). `gateway.js` spawns all three behind one PORT (Railway).
- WhatsApp: **Evolution API v2** over HTTP (`apps/api/src/whatsapp/providers/evolution.provider.ts`, interface in `whatsapp-provider.interface.ts`). Evolution owns the Baileys session; DB stores `ChannelConnection` only. QR flow via `/whatsapp/connections/:id/qr`.
- Inbound: `POST /v1/webhooks/evolution` → `WebhooksService.handleIncomingMessage` → normalize phone → upsert Contact (`@@unique(organizationId, normalizedPhone)`) → find/create Conversation (`mode: AI_AUTOMATIC`) → create Message → AI reply via `queues.aiResponse.add(...)` with **inline fallback** when `REDIS_DISABLED` (`processAiInline`).
- AI: `packages/ai` — OpenAI only, `processAgentTurn()` forced function-call `agent_decision`, RAG via pgvector, safety gates (rate limit, injection, moderation, working hours), handoff below `confidenceThreshold`.
- Queues: `packages/queue` BullMQ; `createQueue().add()` **throws** under `REDIS_DISABLED` — every producer must try/catch and run inline.
- Permissions: DB-seeded codes (seed = runtime authority; `packages/permissions` is drifted and unused at runtime). `PermissionGuard` exact-string matching. Platform owner = ACTIVE membership with role `PLATFORM_SUPER_ADMIN` (checked in `PlatformService.assertPlatformOwner` + 3 web-side spots). **No user currently holds that role — bootstrap required.**
- `Entitlement` + `FeatureFlag` tables exist and are entirely unused → our gating hooks.
- `AuditService.log()` exists and is never called → we wire it for marketing actions.
- Tests: **zero test files exist repo-wide**. Jest scaffolding exists only in `apps/api` (`testRegex .*\.spec\.ts$`, path patterns `unit|integration|security`). This module introduces the first tests.
- Phone normalization today: `normalizePhone()` in `packages/shared/src/utils.ts` = strip non-digits + strip one leading `0`. Contacts are keyed by this legacy form.

## 2. WhatsApp preservation strategy

Absolute rules implemented by design, not by discipline:

1. **No changes to** `EvolutionProvider`, QR flow, session handling, `handleIncomingMessage`'s support path, `MessagesService`, or worker processors — except one *additive* branch in `WebhooksService.handleIncomingMessage` (see §11) executed only when the contact is an active campaign recipient, placed before the existing AI-support trigger and falling through to existing behavior on any error.
2. Campaign sends go through a **new** `MarketingSendService` that calls the existing `EvolutionProvider.sendText` — never `WhatsAppService.broadcast` (unsafe legacy path; left untouched).
3. Kill switch stops **marketing sends only** (checked in the marketing send service), never the provider or support replies.
4. Marketing conversations reuse the existing Inbox (same Conversation/Message tables); no second inbox.
5. No dependency upgrades. New deps kept minimal: `exceljs` **or** `xlsx` alternative — decision: use `exceljs` (maintained, no known prototype-pollution CVEs like `xlsx`) for .xlsx parse + CSV via hand-rolled parser for our narrow shape.

## 3. Entitlement & authorization model (Phase 4)

- Capabilities (feature keys on existing `Entitlement` table, per organization):
  `AI_SALES_MODULE`, `PRODUCT_CATALOG`, `LEAD_DISCOVERY`, `LEAD_IMPORT`, `MARKETING_CAMPAIGNS`, `AI_PERSONALIZATION`, `AI_SALES_AGENT`, `DO_NOT_CONTACT`, `SALES_ANALYTICS`, `SALES_SETTINGS`.
- New permission codes (added to `packages/permissions` AND seed, fixing the drift): `marketing.read`, `marketing.products.manage`, `marketing.leads.manage`, `marketing.campaigns.manage`, `marketing.campaigns.start`, `marketing.dnc.manage`, `marketing.settings.manage`, `marketing.analytics.read`.
- Guard: new `MarketingEntitlementGuard` = AuthGuard context → resolve org → require `Entitlement(org, AI_SALES_MODULE).isEnabled` → then `PermissionGuard` for the specific code. Platform owner (PLATFORM_SUPER_ADMIN) passes permission checks for marketing routes via the same role-permission mechanism (we seed the role with marketing permissions — no email checks anywhere).
- Bootstrap (idempotent, auditable, server-side): script `packages/database/src/bootstrap-marketing.ts` run via `pnpm db:seed`-style command; reads `PLATFORM_OWNER_EMAIL` from config (set to `dddree42@gmail.com` in `.env`, **not** in code):
  1. find user by email; if absent → log + exit 0 (idempotent; rerun after registration),
  2. ensure PLATFORM_SUPER_ADMIN role has marketing+platform permissions,
  3. ensure ACTIVE membership with that role in the user's org (or all their orgs' owner org),
  4. upsert the 10 entitlements for that org,
  5. write AuditLog rows for anything actually changed.

## 4. Data model (additive migration `20260811000000_ai_sales_marketing`)

All new tables; only additive columns elsewhere. Money = **integer minor units (halalas)** + currency. No floats.

- `SalesProduct` — org-scoped catalog: nameArabic, nameEnglish?, slug (unique per org), shortDescription, fullDescription, priceMinor Int, currency (SAR), targetCustomer, features Json, benefits Json, painPoints Json, salesTalkingPoints Json, faqs Json, objectionGuidance Json, productPageUrl?, websiteUrl?, storeUrl?, purchaseUrl?, demoUrl?, active, aiSalesEnabled, maxDiscountPercent Int (≤5 enforced in service), knowledgeBaseId?, timestamps, deletedAt.
- `Lead` — org-scoped: businessName, rawPhone, normalizedPhone (strict E.164 digits), legacyNormalizedPhone (existing `normalizePhone` form, for Contact matching), website?, city?, businessType?, source (GOOGLE_PLACES|EXCEL_IMPORT|MANUAL|MOCK), providerId?, providerRef?, status (lifecycle §12), contactId? FK, websiteProfileId?, discoveredAt, timestamps. `@@unique([organizationId, normalizedPhone])`.
- `LeadStateTransition` — leadId, fromStatus, toStatus, reason, source, createdAt.
- `DncEntry` — org-scoped: normalizedPhone, reason, source (OPT_OUT|MANUAL|IMPORT|ADMIN), addedById?, note?, createdAt, removedAt?, removedById?. `@@unique([organizationId, normalizedPhone])` (active rows enforced in service; removal = audited update).
- `LeadImport` — filename, createdById, totals (total/valid/invalid/duplicate/dnc/previouslyContacted), source, createdAt.
- `Campaign` — org-scoped: name, productId FK, targetBusinessType, city, requestedLeadCount, status (DRAFT|PREPARING|READY|RUNNING|PAUSED|COMPLETED|CANCELLED|FAILED), salesContext?, counters (denormalized, reconciled from recipients), startedAt/pausedAt/completedAt, createdById, executionKey (idempotent start guard), timestamps.
- `CampaignRecipient` — campaignId, leadId, status (PENDING|READY|QUEUED|SENDING|SENT|FAILED|REPLIED|SKIPPED_DUPLICATE|SKIPPED_DNC|SKIPPED_PREVIOUS_CONTACT|CANCELLED), personalizationStatus (PENDING|READY|FAILED), personalizedMessage?, personalizationMeta Json?, attemptCount, lastAttemptAt?, sentAt?, repliedAt?, providerMessageId?, messageId? FK, errorCode?, errorMessage?, isTest Boolean default false, timestamps. `@@unique([campaignId, leadId])`.
- `DiscountOffer` — org, leadId, productId, conversationId?, originalPriceMinor, discountPercent, discountAmountMinor, finalPriceMinor, reason, createdAt. (Backend-computed only.)
- `CustomSoftwareRequest` — org, leadId?, conversationId?, companyActivity, problem, desiredSolution, keyFeatures Json, contactDetails, status, createdAt.
- `WebsiteProfile` — org, url, normalizedHost, businessSummary?, services Json?, relevantContext?, possiblePainPoints Json?, productFit?, fetchStatus (OK|FAILED|BLOCKED), fetchedAt, error?.
- `MarketingSettings` — one row per org: killSwitchEnabled (default false), testPhoneNumber?, ownerHotLeadPhone?, safeCampaignMode (default true → canary caps), defaultTone, maxLeadsPerCampaign, maxWebsiteAnalysesPerCampaign, maxPersonalizationAttempts, dailyAiBudgetMinor?, monthlyAiBudgetMinor?, discoveryProvider (MOCK|GOOGLE_PLACES), timestamps.
- `HotLeadAlert` — org, leadId, campaignId?, conversationId?, dedupKey unique, sentAt, status.
- Additive column: `Conversation` gets **nothing** (context stored in `metadata` JSON already used by support-learning — we add `metadata.salesContext = { campaignId, leadId, productId }`). `Message` gets nothing (campaign linkage via `CampaignRecipient.messageId` + `metadata`).

Migration safety: hand-written additive SQL matching existing style; no destructive statements; verified by inspection + `prisma migrate diff` where possible.

## 5. Phone identity (Phase 6)

New `packages/shared` functions (existing `normalizePhone` untouched):
- `normalizePhoneStrict(raw)` → canonical digits with country code; Saudi rules: `05x…`→`9665x…`, `9665x…` stays, `+966…`/spaces/dashes stripped; returns `{ normalized, valid, country }`.
- `legacyNormalizePhone(raw)` = existing function (re-exported) — used ONLY to look up existing Contacts so we never duplicate identities.
Lead stores both forms. Dedupe/DNC/eligibility use the strict form; Contact linkage uses the legacy form via the existing unique index.

## 6. Lead discovery (Phase 8)

- `LeadDiscoveryProvider` interface (`discover(query): Promise<DiscoveredLead[]>`, `getStatus(): LIVE_VERIFIED|CONFIGURATION_REQUIRED|TEST_ONLY|ERROR`).
- `GooglePlacesProvider` — Places API Text Search + Details (documented, compliant; no scraping/CAPTCHA evasion). Requires `GOOGLE_PLACES_API_KEY` (new optional config). Without key → status `CONFIGURATION_REQUIRED` and provider refuses to run.
- `MockDiscoveryProvider` — deterministic fake Saudi businesses, status `TEST_ONLY`; default in development and for the E2E flow.
- Rules: skip leads without phone; keep phone-without-website; store provider + providerRef; usage recorded via existing `UsageEvent` (featureKey `LEAD_DISCOVERY`).

## 7. Excel/CSV import (Phase 8)

- `.xlsx` via `exceljs`, `.csv` via strict internal parser. Limits: file ≤ 5MB, rows ≤ 5000, MIME + extension checked.
- Per-row validation (name+phone required, website optional); one bad row skips that row only.
- Preview endpoint returns counts: total/valid/invalid/duplicate/dnc/previouslyContacted before commit; commit endpoint persists `LeadImport` + leads.
- Export protection: any future CSV export escapes `= + - @` leading characters.

## 8. Website intelligence (Phase 9)

- `SafeWebsiteFetcher`: http/https only, DNS-resolve then reject private/link-local/metadata IPs (SSRF), 10s timeout, ≤3 redirects (re-validated per hop), ≤1MB body, content-type must be text/html, max 3 pages (home + services/about discovered from same-host links).
- Summarization via structured AI call; website content is injected as clearly-delimited UNTRUSTED data in prompts.
- Failure → `WebsiteProfile.fetchStatus=FAILED`, personalization falls back to name+category+product; never fails the lead or campaign.

## 9. AI layer (Phases 9 & 11)

New `packages/ai/src/marketing/` (versioned prompt modules, one per concern):
- `prompts.ts` — PROMPT_VERSION const + builders: website summarization, personalization, sales agent system prompt, intent classification, opt-out classification, handoff summary. All treat lead/website/customer text as untrusted.
- `personalization.ts` — `generatePersonalizedMessage()` returning validated structured output `{ message, personalizationReason, usedWebsiteContext, confidence, warnings }` via forced function-call + manual schema validation (same pattern as `agent_decision`); bounded retries (2); failure → PERSONALIZATION_FAILED.
- `sales-agent.ts` — `processSalesTurn()`: trusted context = product (price from DB only), campaign, lead, KB RAG, history, discount policy. Decisions: REPLY | OFFER_DISCOUNT(request only — backend computes) | HANDOFF | CUSTOM_SOFTWARE | NO_REPLY. Reuses existing safety gates.
- `intent.ts` — deterministic Arabic keyword rules first (أبي أشترك، كيف أدفع، لا ترسل، وقف الرسائل، unsubscribe, stop…) then AI classification fallback; uncertain opt-out → treat as opt-out (favor stopping).
- Cost caps: marketing AI calls check `MarketingSettings` daily/monthly budget against summed `UsageEvent`/`AiRun` costs before running; over budget → pause campaign + notify owner (circuit breaker).

## 10. Discount engine (Phase 11)

`DiscountService.computeOffer(orgId, leadId, productId, reason)`:
- effective = min(product.maxDiscountPercent, 5); price math in integer minor units; persists `DiscountOffer`; audited.
- The sales agent can only *request* an offer; the reply template injects backend-computed numbers. Prompt injection cannot change them because the model never computes prices.

## 11. Campaign engine + Inbox integration (Phase 10–11)

- Queue: add `CAMPAIGN_DISPATCH` to `QUEUE_NAMES` + `queues`; worker processor `campaign-dispatch.processor.ts`; API-side inline fallback loop (bounded batch) for `REDIS_DISABLED`, same try/catch pattern as AI replies.
- Start guard: `UPDATE campaigns SET status='RUNNING', executionKey=$key WHERE id=$id AND status IN ('READY','PAUSED')` — 0 rows updated ⇒ reject (double click/two tabs/two workers safe). Recipients move PENDING→QUEUED via conditional `updateMany`.
- Pre-send final check (inside send service, single transaction-ish sequence): campaign RUNNING + kill switch off + entitlement on + provider `isReady` + recipient status QUEUED (conditional update to SENDING — atomic claim) + fresh DNC check + not REPLIED + contact policy allows. Queue payload carries IDs only, never authority.
- Reply race: inbound handler marks recipient REPLIED **atomically before** the AI branch; the sender's conditional SENDING claim excludes REPLIED rows — no message after reply.
- Send: create Contact (via legacy normalization) if needed → create Conversation (with `metadata.salesContext`, `mode: AI_AUTOMATIC`) → create OUTBOUND Message row → provider send → update statuses. Throttle: configurable delay between sends (default 3s + jitter), bounded batch per tick.
- Test send: separate endpoint; sends the selected recipient's personalized text to `MarketingSettings.testPhoneNumber` only; recorded as `CampaignRecipient.isTest` clone row (excluded from all analytics/counters); returns real provider result.
- Dry run: full selection→normalization→dedupe→DNC→previous-contact→personalization→eligibility pipeline with sends stubbed; produces a report.
- Pause/resume/cancel: status transitions with conditional updates; QR disconnect (`CONNECTION_UPDATE` → DISCONNECTED) auto-pauses RUNNING campaigns (new small hook in `handleConnectionUpdate`, additive).
- Kill switch: `MarketingSettings.killSwitchEnabled` checked at claim time; enabling it never touches WhatsApp support flows. Audited.
- Inbox: replies flow through the untouched existing inbound path; the only addition in `handleIncomingMessage` (guarded, try/catch, fail-open to existing behavior):
  1. after Contact resolution, look up active CampaignRecipient by contact/lead phone;
  2. if found: atomically mark REPLIED, stop future marketing, tag conversation `metadata.salesContext`, run opt-out/intent classification, then route AI to `processSalesTurn` instead of support `processAgentTurn`;
  3. if not found: existing support behavior, byte-for-byte.
- Context modes: NORMAL_SUPPORT (default; anything without salesContext), MARKETING_SALES (campaign reply), HUMAN_HANDOFF (existing status mechanics).

## 12. Lead lifecycle

DISCOVERED → ELIGIBLE → CONTACTED → REPLIED → INTERESTED → HOT → READY_TO_BUY → HANDED_TO_SUPPORT → WON / LOST / NOT_INTERESTED / DO_NOT_CONTACT / CUSTOM_SOFTWARE_REQUEST. Every transition writes `LeadStateTransition`.

## 13. Hot leads, handoff, notifications (Phase 12)

- Hot lead detection: deterministic rules + structured classification `{ intent, interestLevel, requiresHuman, confidence, reason }`.
- Owner alert: one WhatsApp message to `ownerHotLeadPhone` per lead per campaign (dedup via `HotLeadAlert.dedupKey`), Arabic template with internal inbox link. Failure logged, never blocks the conversation.
- Handoff: existing mechanism (status WAITING_FOR_AGENT + summary note) + AI-generated Arabic summary persisted as InternalNote. Triggers per spec (human request, custom software, >5% discount ask, uncertainty, repeated failure).
- No appointment booking; text-only outbound.

## 14. Analytics (Phase 12)

`GET /v1/marketing/analytics` + campaign detail — all from real DB aggregates (leads, recipients, DNC, replies, lifecycle counts, discount offers). Delivered/Read shown only from `Message.deliveredAt/readAt` when present; otherwise displayed as غير متاح من مزود الاتصال الحالي. Never fabricated.

## 15. Frontend (Phase 13)

- Nav item التسويق والمبيعات appended in `apps/web/src/app/app/layout.tsx` for platform owner / entitled users (server-verified via `GET /v1/marketing/entitlements`; UI hiding is convenience only — all enforcement server-side).
- Routes under `apps/web/src/app/app/marketing/`: `page.tsx` (overview), `products/`, `discovery/`, `import/`, `leads/`, `campaigns/` + `campaigns/[id]/`, `dnc/`, `analytics/`, `settings/`.
- Matches existing hand-rolled design (Cairo font, gold/charcoal Tailwind palette, existing Button/Input/Modal), RTL, Arabic labels, loading/empty/error/disabled states, pagination for big tables.

## 16. Testing (Phase 14)

Location: `apps/api/src/**/__tests__/{unit,integration,security}/*.spec.ts` (matches jest path patterns). Prisma mocked at service level for unit tests; integration tests use Nest testing module with mocked provider + in-memory fakes (no live DB dependency to keep CI green on this machine).
- Unit: strict phone normalization matrix, money/discount math, DNC logic, eligibility, campaign transitions, kill switch, entitlement checks, trusted URL policy, opt-out keyword detection, spreadsheet-injection escaping.
- Integration: import preview/commit, dry run, start/pause/resume/cancel, double-start, DNC block, previous-contact block, reply-during-send race, test-send isolation, discount cap incl. "خصم 50%" injection, custom-software no-price, hot lead dedup.
- Security: unauthorized access to marketing routes, cross-tenant lead/campaign access, DNC bypass attempts, SSRF fetcher matrix, mass assignment.
- WhatsApp regression: assert `handleIncomingMessage` non-campaign path unchanged (snapshot-style behavioral tests with campaign lookup returning null).

## 17. Rollback & release

- Disable module: flip org entitlement `AI_SALES_MODULE` off (routes 403, nav hidden) — support untouched.
- Kill switch: stops marketing sends instantly.
- Provider off: settings `discoveryProvider=MOCK`.
- Stages: DEVELOPMENT → SIMULATION_VERIFIED (mock provider + dry runs + tests) → INTERNAL_OWNER_ONLY (entitlement only for owner org) → CONTROLLED_LIVE_TEST (test-send to owner number) → canary campaign (safeCampaignMode caps recipients) → PRODUCTION_READY.
- Future: Meta Cloud API provider implements the same `WhatsAppProvider` interface; store webhook (SALE_COMPLETED) schema reserved, not faked.

## 18. External dependencies

| Dependency | Status | Notes |
|---|---|---|
| Evolution API | existing | untouched |
| OpenAI | existing | reused for marketing AI |
| Google Places API | CONFIGURATION_REQUIRED | needs `GOOGLE_PLACES_API_KEY`; Mock provider until then |
| exceljs | new package | xlsx parsing; reason: maintained, safer than `xlsx` |
