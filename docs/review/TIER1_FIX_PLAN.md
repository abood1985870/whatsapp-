# Tier 1 — Consolidated Fix-Wave Plan

Companion to `TIER1_FINDINGS.md`. Ordered by risk-reduction per unit of change, not by finding number.

**Ground rules for execution:** small reviewed batches, never one giant change. Each wave is independently shippable and independently revertible. No destructive database work in any wave. Nothing here touches the WhatsApp inbox behaviour, the AI support reply chain, or existing customer data.

---

> ## Revised order — the project is not published yet (owner-confirmed)
>
> The original order was written for a live service under threat. It is not. The waves themselves do not change; **the order does**, and it changes in your favour.
>
> **New Wave A — "broken in the trial today" (half a day).** These are not risks, they are current bugs. Cheap, isolated, and each one visibly improves the product now:
> - `campaign-dispatch.service.ts:218` → remove the `* 100`. Campaigns stop halting at 1% of budget. *(D-2)*
> - Seed the 14 missing permission codes **together with** the platform-owner check fix. The settings, branches, teams, routing, working-hours, and SLA pages come back to life. *(C-8 + C-9 — see constraint 1)*
> - Clear `pendingSupportEscalation` after a support reply is forwarded. Stops the agent's every subsequent message reaching a customer. *(B-4)*
> - Set the two voice cost-rate variables and make the breaker fail closed when a budget is set but the rates are 0. *(D-1)*
> - Clamp the message length before `maskPII` and fix the regex — a trial account can freeze the API today. *(G-1)*
> - Add the child-process exit handlers in `gateway.js`. *(I-1)*
>
> **Then Wave 1 (the tenant boundary), unhurried.** This is the right time for it: no traffic to migrate, no incident clock, no customers to notify. Doing it now is far cheaper than doing it after launch.
>
> **Then Waves 2–4** as written.
>
> **Wave 0 becomes a pre-launch checklist**, not an emergency. Every item in it must be done *before* the first public deploy, because they all go live the same minute the service does. Do not deploy to Railway until 0.1, 0.2, 0.5, 0.6 and 0.7 are complete.
>
> **One thing to confirm before Wave A:** is a real WhatsApp number connected to the trial, with real people messaging it? If yes, F-1 (opt-out is recorded on only one path) and F-4 (no emergency stop) affect real people now and move into Wave A. If it is only your own test numbers, they stay in Wave 4.

## Sequencing constraints (these are not negotiable)

1. **C-8 and C-9 must ship together.** Seeding the 14 missing permission codes is required to make the settings UI work at all — and it simultaneously opens the platform-owner escalation path, which is blocked today only because those codes are absent. Shipping the seed alone would turn a latent P1 into a live P0.
2. **Wave 0 before anything else.** It is small, it is reversible, and it closes the two holes reachable without an account.
3. **Wave 1 before Wave 3's AI-cost work.** Several cost controls are per-organization; there is little point tightening them while the tenant boundary itself is open.
4. **Do not "fix" `OrganizationGuard` by making it fail closed without first doing the rename.** Fail-closed on a guard whose parameter never matches would 403 every route in the application.

---

## Wave 0 — Emergency hotfix (hours, ~6 files)

Everything reachable **without an account**, plus the one-line changes that stop a single request from taking the platform down.

| # | Change | Finding | Effort |
|---|---|---|---|
| 0.1 | `evolution.provider.ts:138` → return `false` when the secret is unset. Add `EVOLUTION_WEBHOOK_SECRET` to the config schema as required whenever `EVOLUTION_API_URL` is set, and to `.env.production` + `docs/DEPLOYMENT.md`. Generate and set the secret in the deployed environment. | B-1 | S |
| 0.2 | Delete the `messages.update` fallback branch at `webhooks.service.ts:24-30`; move signature validation into a controller guard so no branch can bypass it. Scope `handleMessageUpdate`'s `updateMany` by an organization resolved from the validated instance id. | B-2 | S |
| 0.3 | Clamp `context.message` to 4000 chars before any regex work in `processAgentTurn`, and rewrite the email regex to a linear form (`[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,24}`). Cap `dto.input` on `/ai-agents/:id/test`. | G-1 | S |
| 0.4 | Drop the `userId`/`organizationId` query parameters from `/v1/notifications`; derive both from the JWT. Scope `markAsRead` by `updateMany({ where: { id, userId } })`. | A-7 | S |
| 0.5 | Set `NODE_ENV=production` and an explicit `CORS_ORIGINS` in the deployed environment. Make `getAllowedOrigins()` throw rather than return `true` when no list is configured. | C-4 | S |
| 0.6 | Register `MulterModule` globally with `limits: { fileSize: 10MB, files: 1 }`. | G-2 | S |
| 0.7 | `gateway.js`: add `.on('exit', code => process.exit(code ?? 1))` to all three children, and pass `xfwd: true`. `main.ts`: `app.set('trust proxy', 1)`. | I-1, C-7 | S |

**Exit gate:** an unauthenticated request cannot cause a send, a database write, or an outage. Existing WhatsApp traffic still flows (verify with one real inbound message end-to-end before and after).

---

## Wave 1 — Close the tenant boundary (3–5 days, the largest change)

This is the wave that matters. It removes roughly half the P0 findings.

**1.1 — Make the tenant id server-derived (the structural fix).**
- Add a `@CurrentOrganization()` param decorator that reads `request.membership.organizationId`.
- Change `PermissionGuard` and `OrganizationGuard` to resolve the membership from the JWT and **throw** when a route is marked as tenant-scoped and none resolves. Remove the `activeMemberships[0]` fallback — replace it with an explicit `X-Organization-Id` header (or a session-selected org) validated against the caller's memberships, so multi-org users are handled deliberately rather than accidentally.
- Delete `organizationId` from every request DTO and query signature that currently accepts it.
- *Closes:* A-3, A-4, A-8, and the guard half of A-1.

**1.2 — Rename the path parameter.** `:id` → `:organizationId` throughout `organizations.controller.ts`. One mechanical change restores the guard on 16 routes. Add `PermissionGuard` to `GET /v1/organizations/:organizationId`. *Closes:* A-1, A-2, most of A-6's organizations rows.

**1.3 — Add `organizationId` to every service `where`.** Modules, in descending order of exposure: `messages`, `conversations`, `contacts`, `ai-agents`, `knowledge`, `files`. Convert writes to `updateMany`/`deleteMany` so a mismatch becomes a 0-row no-op. Add `deletedAt: null` to the four reads that omit it. *Closes:* A-5, A-6, C-2.

**1.4 — Systemic backstop.** A Prisma client extension injecting the tenant predicate and the soft-delete predicate, plus `previewFeatures = ["strictUndefinedChecks"]` so a future `undefined` throws instead of silently widening a query. This is what stops the class of bug from returning.

**1.5 — Targeted repairs.** Validate `dto.roleId` in `updateMemberRole` (reject `isSystem` and foreign-org roles). Re-query ids scoped to the org before `createMany` in `bulk-action`, and cap the array length. Scope the three `findUnique` product reads on the voice path and validate `updateLeadInterest.productId` against the caller's org. *Closes:* G-6, A-9, and half of C-9.

**Exit gate:** a second test organization can be created and, from its account, no route returns, modifies, or deletes any row belonging to the first. Write the test before the fix.

---

## Wave 2 — Authentication and roles (2–3 days)

**Ship 2.1 and 2.2 in the same deployment.** See sequencing constraint 1.

| # | Change | Finding |
|---|---|---|
| 2.1 | Make `packages/permissions` the single source of truth and add an idempotent deploy-time sync that upserts every permission code and applies `ROLE_PERMISSIONS` to each system role. Fixes the 14 dead codes and the three roles with zero grants. Retire `SYSTEM_ROLES` in `packages/shared`. | C-8 |
| 2.2 | Replace the role-name comparison in `platform.service.ts` with `role.isSystem && role.organizationId === null && role.name === 'PLATFORM_SUPER_ADMIN'` — or better, a dedicated `platform.*` permission code. Exclude system roles from `listRoles`. Reject reserved names in `createRole`. | C-9 |
| 2.3 | Add `deletedAt: null` to the user lookup in `AuthGuard`, `login`, and the realtime handshake. | C-3 |
| 2.4 | Use the existing `Session` table: store a `jti`, check it in `AuthGuard`, delete it on logout, and revoke all sessions on password change and reset. Shorten the access token and introduce a real refresh token. | C-6 |
| 2.5 | Enforce 2FA at login — return a short-lived `mfa_pending` token and require a verification exchange. Require a valid TOTP or password to disable 2FA. Do not persist the credential until first successful verification. | C-5 |
| 2.6 | Per-email and per-IP limiter on `/auth/login`, `/forgot-password`, `/reset-password`, `/2fa/verify`; lockout with backoff; failed-login audit rows; raise the password minimum. | C-7 |
| 2.7 | Identical response body from both `forgotPassword` branches; dummy `bcrypt.compare` in the user-not-found login branch. | C-10 |
| 2.8 | `select` explicit fields in `AuthGuard`'s user query so `passwordHash` is never on the request object. Drop the query-string token branch in the realtime server; gate `typing` on actual room membership; add an organization claim or an explicit switch event. | C-13, C-12 |

---

## Wave 3 — Money, cost, and AI behaviour (2–3 days)

**3.1 — Correct the numbers.**
- `campaign-dispatch.service.ts:218` → `Math.round(usd * 375)`, with a unit test pinning 1 USD → 375. *(D-2)*
- Require the two voice cost-rate variables when `VOICE_PROVIDER` is not `SIMULATION`; make `isOverBudget` **fail closed** when a budget is configured but both rates are 0; write `actualCostMinor` from the provider's reported price; reserve an estimate at admission so in-flight calls count. *(D-1)*
- Aggregate `AiRun.costUsd` per org per day and feed it into the same breaker. *(D-6)*

**3.2 — Bound AI spend.**
- Call `checkRateLimit` at the top of `handleInbound`, with a database-counter fallback when Redis is disabled. Add a per-conversation AI-turn cap counted from `AiRun` rows written on **every** decision, not just `REPLY`/`HANDOFF`. Consult `isOverBudget` before `processSalesTurn`. *(D-3)*
- Set `max_tokens` at every chat call site, pass an explicit `timeout` and `maxRetries: 0` (retries are already handled upstream), and add `max_response_output_tokens` to the realtime session. Cap `assembleContext` output. *(D-4)*
- Add a startup and periodic sweeper that terminates non-terminal `Call` rows older than `maxCallSeconds`. *(D-5)*

**3.3 — Close the prompt-injection holes.**
- Wrap **every** database-sourced prompt slot in the untrusted-data envelope — caller context, lead business name, `ragContext`, conversation history — and drop the "معلومات موثوقة من نظامنا" heading. Escape the delimiter in the interpolated value. Cap each slot's length; `captureDetails` string arguments should be ~120 chars, not 2000. *(E-1, E-2, E-5, E-9)*
- Normalize Arabic-Indic digits before the output guard, drop the currency-word requirement, and add Arabic word-forms. Write the missing test. *(E-3)*
- Assert on `assistant_transcript` for the voice channel: extract amounts, compare against the loaded catalogue, raise a `CallEvent` and a spoken correction on a mismatch. Detection after the fact is worth far more than nothing. *(E-4)*
- Store auto-learned FAQs as `isActive: false` pending review, with `maskPII` applied. *(E-2, H-8)*
- Move tenant persona strings below the platform rules and mark them "style only". *(E-6)*
- Apply the existing `containsUntrustedUrl` to the voice follow-up `note` and to the campaign personalization validator. *(E-7, E-8)*

---

## Wave 4 — Outbound message safety (2 days)

**4.1 — One choke point.** Route every send through a single `sendOutbound()` wrapper that all paths must use, enforcing in order: org kill switch → DNC → opt-out → per-org daily cap → per-contact frequency cap → quiet hours. Today five of the sixteen send paths have none of these. *(F-1, F-4)*

**4.2 — Detect opt-out everywhere.** Run `detectOptOutIntent` in `handleIncomingMessage` for all conversations, not only sales ones, before any auto-reply. *(F-1)*

**4.3 — Fix the recipient string.** Send campaigns to `lead.normalizedPhone` (strict) rather than `contact.normalizedPhone` (legacy). Plan a separate, carefully reviewed one-time contact merge — that part is **L** effort and must not be bundled here. *(F-2)*

**4.4 — Harden or remove `broadcast`.** Cap the array, require each entry to resolve to an existing org contact, run the wrapper per recipient, persist a `Message` row per send. *(F-3)*

**4.5 — Idempotency.** Use `messageId` as the BullMQ `jobId`; claim `PENDING→SENDING` atomically before POSTing; accept `clientIdempotencyKey` from the client and honour the unique constraint; treat a missing provider message id as a failure rather than storing the `"unknown"` sentinel. Add a reaper for recipients stranded in `SENDING`. *(F-5)*

**4.6 — Clear the escalation flag.** Consume `pendingSupportEscalation` atomically inside `handleSupportReply` before forwarding, and require the reply to reference the conversation. *(B-4)*

**4.7 — Verify the support phone number** with a code before activating it, and link to the inbox instead of inlining the customer's question and number. *(H-7)*

---

## Wave 5 — Privacy, retention, and remaining robustness (2–3 days)

| # | Change | Finding |
|---|---|---|
| 5.1 | Store only redacted text in `CallTranscriptTurn.text`; feed the redacted copy into summarization; redact the summary before persisting; mask the caller number in event metadata. | H-1 |
| 5.2 | A shared logger wrapper with a redaction list. Log ids, not payloads, in the dead-letter processor. Route phone numbers through `maskPhone`. | H-2, H-4 |
| 5.3 | Actually sanitize `sanitizedPayload` before persisting; set `payloadHash` to a real digest; add `webhookEvent` to the cleanup processor. | H-3 |
| 5.4 | Move masking before moderation; apply it to history and to the marketing and voice paths; add phone and name patterns; replace identity fields in the realtime instructions with an opaque token the tools resolve server-side. Pin or allow-list `OPENAI_BASE_URL`. | H-5 |
| 5.5 | Implement retention driven by the existing (currently unread) settings, and an erasure path that hard-deletes or tokenizes a contact's messages, transcripts, webhook events, AI runs, and FAQ entries. Wire `DataDeletionRequest`. | H-6 |
| 5.6 | One shared `csvCell()` escaping helper at all four export sites. | G-4 |
| 5.7 | Pin the validated IP in the website fetcher (connect-to-IP with an explicit Host header, or a custom undici `connect.lookup`). | G-5 |
| 5.8 | One shared `clampPage()` at every list service; add `take`/`skip` to `ConversationsService.findAll`; guard against `NaN`. | G-3 |
| 5.9 | Stream the XLSX reader with a row budget; cap and batch `contacts/import`; stop swallowing row errors. | G-7 |
| 5.10 | Encrypt TOTP seeds, OAuth tokens, webhook secrets, and WhatsApp session blobs at rest. | C-14 |
| 5.11 | Implement a mail transport, cut the reset TTL to 30–60 minutes, invalidate prior tokens, stop setting `emailVerifiedAt` at registration. | C-11 |
| 5.12 | Add `middleware.ts` redirecting unauthenticated `/app/*` to `/login`. | C-15 |

---

## Wave 6 — Configuration hygiene (half a day)

- Replace all three `z.coerce.boolean()` uses with an explicit `"true"`/`"false"` transform. *(I-3)*
- Register the webhook secret as a header rather than a query parameter; drop the `query.secret` acceptance branch. *(I-4)*
- Untrack `apps/web/.env.production`, set both variables in the Vercel project, fail the build when unset. *(I-2)*
- Add `scripts/*.sql` to `.gitignore`, `git rm --cached` the existing dump, point `backup-db.cmd` outside the repo. *(I-5)*
- Delete the five dead Supabase/Sentry variables, or wire them up. Either implement object storage or remove the config surface that implies it exists. *(I-6)*
- Wire `MAX_UPLOAD_SIZE_MB` to the body-parser limit and lower the JSON default well below 50 MB. *(G-8)*
- Delete `nixpacks.toml` or switch the builder to it. Gate the `REDIS_URL` check in `start.sh` on `REDIS_DISABLED`. Fix `files/:id/download` to redirect to `storageKey`. Seed non-routable phone numbers and `HUMAN_ONLY` conversations. *(I-7, I-8, G-9, F-7)*

---

## What is deliberately **not** in this plan

- **Load and concurrency-at-scale testing** — deferred by agreement until real traffic exists.
- **The contact-record merge** implied by F-2. It is a data migration over live customer records and deserves its own review, its own backup, and its own rollback plan.
- **Payment processing.** No payment provider integration exists; `Invoice`/`Payment`/`Credit` are unwritten schema.
- **The `Coupon` model.** It has zero callers. Delete it or design it properly — do not repair it in place.

---

## Effort summary

| Wave | Focus | Estimate | Risk if skipped |
|---|---|---|---|
| 0 | Unauthenticated surface + availability | hours | Anyone on the internet can send messages on your account or take the API down |
| 1 | Tenant boundary | 3–5 days | Any free account reads, edits, and deletes every customer's data |
| 2 | Auth and roles | 2–3 days | Stolen passwords are permanent; the settings UI stays dead |
| 3 | Money and AI behaviour | 2–3 days | Spending caps do not cap; the AI can be steered by customers |
| 4 | Outbound safety | 2 days | No emergency stop; opt-outs are ignored outside campaigns |
| 5 | Privacy and robustness | 2–3 days | No deletion path; customer data in logs; several DoS vectors |
| 6 | Configuration hygiene | half a day | Silent misconfiguration, credentials in git |

Roughly **two to three weeks** of focused work for one developer to clear Tier 1, with Waves 0 and 1 accounting for the overwhelming majority of the risk reduction.
