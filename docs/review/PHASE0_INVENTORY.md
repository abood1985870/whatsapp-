# Phase 0 — System Inventory

Date: 2026-08-11 · Branch: `feature/enterprise-ai-voice` (contains all three modules)
Method: four parallel evidence-based sweeps over the actual code, plus direct verification of the highest-impact claims by the lead reviewer.

---

## 1. Stack & topology

| Layer | Technology | Location |
|---|---|---|
| API | NestJS 10, URI versioning, **no global prefix** — every path is `/v1/...` | `apps/api` |
| Web | Next.js 14 App Router, all pages `"use client"`, RTL Arabic | `apps/web` |
| Worker | BullMQ consumers | `apps/worker` |
| Realtime | Socket.IO (standalone, not Nest) | `apps/realtime` |
| Edge | `gateway.js` — spawns api:3001, realtime:3002, worker; proxies everything on `PORT` | repo root |
| DB | PostgreSQL + pgvector, Prisma 5.22 | `prisma/schema.prisma` (115 models) |
| Shared | ai, config, database, permissions, queue, shared, validation | `packages/*` |

Deploy target: Railway (`railway.json` → `bash start.sh` → `node gateway.js`), healthcheck `/v1/health/ready`. A second, competing build config exists (`nixpacks.toml`) declaring the same commands. `vercel.json` also present.

## 2. Entry points

| Kind | Count | Notes |
|---|---|---|
| HTTP routes | ~150 across 17 controllers | all `/v1/*` |
| Unauthenticated routes | 12 | 5 auth (register/login/forgot/reset/verify), 2 health, 3 webhooks, Swagger `/api/docs` (non-prod only), WS `/v1/voice/media-stream` |
| Webhooks | 3 | `POST /v1/webhooks/evolution`, `POST /v1/voice/webhooks/twilio/{incoming,status}` |
| WebSocket | 2 | Socket.IO `/socket.io` (realtime), raw WS `/v1/voice/media-stream` (voice audio) |
| Queue consumers | 8 registered | 3 queue names declared with **no consumer**: media-download, embedding-generation, notifications |
| Scheduled jobs | 2 repeatable | `cleanup` daily 03:00; `usage-aggregation` per-org 00:30, enumerated **only at worker boot** |
| In-request background loops | 2 | campaign prepare (200 iterations) and dispatch (500 iterations), fired with `void` from the controller |

`ScheduleModule.forRoot()` is imported in the API but **zero** `@Cron`/`@Interval` decorators exist there.

## 3. Auth model

- **JWT only.** Payload = `{ sub, email }`. Secret `AUTH_SECRET`. Lifetime **7 days**, single class of token.
- **No server-side session.** The `sessions` table exists and has **zero runtime usage**. `POST /v1/auth/logout` returns `{success:true}` and invalidates nothing. Password change/reset do not revoke tokens.
- `AuthGuard` verifies the JWT, loads the user with `memberships → role → permissions`, rejects `status !== ACTIVE`, and attaches the **full user row (including `passwordHash`)** to `request.user`. `deletedAt` is not checked.
- **Authorization has two guards with fail-open branches:**
  - `OrganizationGuard` reads `organizationId` from params/body/query and **returns `true` when it finds none**.
  - `PermissionGuard` returns `true` when a route has no `@RequirePermission`; otherwise, when no `organizationId` is in the request, it falls back to **the user's first active membership**.
- Permission codes come from the **database seed**, not from `packages/permissions` (which is drifted and unused at runtime). Two seeders exist (`seed.ts`, `bootstrap-marketing.ts`).
- Platform owner = ACTIVE membership with role name `PLATFORM_SUPER_ADMIN`. Checked server-side in **exactly one place** (`platform.service.ts:8-13`) — never as a guard, and nothing outside the platform module consults it. Checked client-side in three places.
- The role list exists in **three independent copies** that can drift: `packages/permissions/src/index.ts` (unused at runtime), `packages/database/src/seed.ts` (the real authority), and `packages/shared/src/constants.ts:16` (`SYSTEM_ROLES`, which has no consumer anywhere).
- **Frontend has no `middleware.ts`** and no server-side route protection. Every `/app/*` page is client-gated only.
- Token is stored in `localStorage` and sent as a Bearer header. Realtime also accepts the token **in the query string**.

## 4. Data model & tenancy

115 models. `organizationId` appears on 68 of them, but only **21 have a real foreign key** to Organization. **47 carry `organizationId` as a loose scalar with no FK** — including all marketing tables, all voice tables, and billing invoices/payments/credits. Deleting an organization cascades only to the 21.

There is **no Prisma middleware or client extension** — no automatic tenant filter and no automatic soft-delete filter. Every scope must be written by hand in each query.

Observed pattern: `findAll`/list methods consistently filter by `organizationId` and `deletedAt`; **`findOne`-by-id methods consistently do neither.**

Money: all integer minor units except **`AiRun.costUsd` which is `Float`** — the only float money column, and the only one denominated in USD. `Coupon.discountValue` is a single `Int` that holds either a percentage or an absolute amount depending on a sibling string column.

Raw SQL: 8 call sites, **all parameterized tagged templates**; `$queryRawUnsafe`/`$executeRawUnsafe` appear **zero** times.

Migrations: 4 folders, **no DROP / TRUNCATE / destructive ALTER anywhere**. `migration_lock.toml` is missing. `start.sh` falls back to `db:push` if `db:deploy` fails — but no `db:push` script exists, so the fallback would simply error.

## 5. Integrations

| Service | Status | Timeout | Retry |
|---|---|---|---|
| Evolution API (WhatsApp) | live | **none** (HttpModule has no timeout) | only via BullMQ on the worker path |
| OpenAI chat/embeddings | live | 30s | 3 (SDK) |
| OpenAI Realtime (voice) | configured, unverified | 15s connect | none |
| Google Places | key absent → `CONFIGURATION_REQUIRED` | 15s | none |
| Twilio | key absent → `CONFIGURATION_REQUIRED` | 10–20s per op | none |
| Website fetcher (marketing) | live | 10s | none; SSRF-hardened + tested |

**Declared in config but not implemented at all:** S3/MinIO (file service is a mock that fabricates URLs), SMTP/email (nothing sends mail), Sentry (no SDK), n8n, Supabase.

## 6. Verified during inventory (already CONFIRMED, carried into Tier 1)

These four were checked directly against the code and environment by the lead reviewer, not merely reported by a sweep.

| # | Finding | Evidence | Severity |
|---|---|---|---|
| C-1 | **WhatsApp webhook authentication fails open.** `isValidSignature` returns `true` unconditionally when the secret is unset, and the secret **is not set** in this environment. | `apps/api/src/whatsapp/providers/evolution.provider.ts:138`; `.env` has no `EVOLUTION_WEBHOOK_SECRET` | P0 |
| C-2 | **Cross-tenant read of conversations.** `findOne` fetches by id with no `organizationId` filter; `OrganizationGuard` no-ops (no orgId in request) and `PermissionGuard` falls back to the caller's own membership, so the permission check passes. Returns the contact record and last 50 messages of any organization. | `apps/api/src/conversations/conversations.service.ts:27-29`; guards at `common/guards/organization.guard.ts:11-13`, `permission.guard.ts:29-37`; route `conversations.controller.ts:42` | P0 |
| C-3 | **Deleted users retain access.** `User.deletedAt` is never consulted on login or in `AuthGuard`; only `status` is checked. | `apps/api/src/auth/auth.service.ts:57`, `common/guards/auth.guard.ts:23-34` | P1 |
| C-4 | **`NODE_ENV=development` in the environment file.** If used in production this makes CORS reflect any origin with credentials and exposes Swagger at `/api/docs`. Not overridden in `railway.json`/`nixpacks.toml`/`start.sh`. | `.env`; `packages/config/src/index.ts:81-87`; `apps/api/src/main.ts:55-64` | P1 (P0 if this file is what production runs) |

De-risked during inventory (checked and found NOT to be problems):
- `.env` is **not** tracked by git; `apps/api/.env.production` contains only `${VAR}` references, no literals.
- `start.sh` does **not** run the database seed, so demo accounts are not auto-created in production.
- No `$queryRawUnsafe`, no `dangerouslySetInnerHTML`, no `eval` anywhere.
- Migrations contain no destructive statements.

## 7. Scoping decisions for the review tiers

**SKIP — does not apply:**
- Payment processing / checkout / refunds. There is no payment provider integration; `Invoice`/`Payment`/`Credit` models exist but no code writes them. Tier 2 §6 is therefore reduced to the pricing and discount logic that *is* live (product price authority, 5% cap, AI cost accounting).
- Email deliverability. No mail transport exists — this becomes a functionality finding, not a security dimension.

**ADD — domain-specific dimensions this map reveals:**
- **D-1 AI prompt-injection & tool abuse.** The voice tool engine and the WhatsApp sales agent let a model take actions. Attack surface: can caller/customer text cause an unauthorized action, a wrong price, or an over-cap discount?
- **D-2 Outbound-message safety.** Can any input path cause the system to send a real WhatsApp message or place a call to a real person? This is money and reputation, not just data.
- **D-3 Entitlement bypass.** Module gating (`AI_SALES_MODULE`, `AI_VOICE_MODULE`) is a commercial boundary; it must be tested like an authorization boundary.
- **D-4 Webhook trust boundary.** Three unauthenticated public endpoints that mutate customer data and spend money.
