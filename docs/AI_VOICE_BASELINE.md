# AI Voice Employee — Baseline Record

Date: 2026-08-11

## Phase 0 — Workspace safety

- Branch created: `feature/enterprise-ai-voice`
- Base commit: `46a9f86` (`feature/enterprise-ai-sales`, "Add final audit doc for AI sales module")
- **Why branched from the sales branch, not `main`:** the Voice module is a second *channel* on the existing sales engine. It reuses `SalesProduct` (price authority), `DiscountService` (5% cap), `Lead` lifecycle, `HotLeadService`, DNC, and the marketing entitlement pattern. Branching from `main` would mean duplicating all of it — explicitly forbidden by the directive.
- Working tree at branch time: clean except `.claude/settings.json` (local tool settings, never committed).
- No stashes. No user work discarded. No reset/force operations used.

## Phase 1 — Baseline evidence

| Command | Exit code | Result | Classification |
|---|---|---|---|
| `pnpm --filter @qanoai/api typecheck` | 0 | clean | BASELINE_PASS |
| `pnpm --filter @qanoai/web typecheck` | 0 | clean | BASELINE_PASS |
| `pnpm --filter @qanoai/api exec jest` | 0 | 6 suites / 36 tests passed | BASELINE_PASS |
| `pnpm typecheck` (turbo) | 1 | turbo binary crashes on this Windows machine (exit 3221225781, missing DLL) | PRE_EXISTING_FAILURE (tooling) — use `pnpm --filter` |
| `pnpm --filter @qanoai/web build` | 1 | "✓ Compiled successfully" then `EPERM: symlink` writing `output: 'standalone'` (Windows symlink permission) | PRE_EXISTING_FAILURE (tooling) — `tsc --noEmit` is the authoritative type gate; succeeds on Linux/Railway |

## Phase 2 — Voice-relevant reconnaissance findings

Confirmed by searching the repository (not assumed):

1. **No telephony/voice code exists.** Searches for `twilio|telnyx|vonage|plivo|sip|voice|telephony|webrtc` across `apps/` returned nothing. This is greenfield.
2. **No WebSocket client library.** `apps/api` has `@nestjs/websockets` + `@nestjs/platform-socket.io` (Socket.IO protocol) but no raw `ws` client. Realtime AI and telephony media streams both need raw WebSocket → `ws` is a justified new dependency.
3. **`gateway.js` does not proxy WebSocket upgrades to the API.** Only `/socket.io` has `ws: true`; the catch-all proxy to port 3001 does not. A dedicated WS-enabled proxy route is required for provider media streams.
4. **Object storage is a stub — critical for recordings.** `apps/api/src/files/files.service.ts` fabricates a `http://localhost:9000/...` URL and never uploads anywhere ("Mock S3/MinIO Integration"). Consequence: call recording **cannot** be claimed as working. Recording stays OFF by default, behind a feature flag, and object storage is classified `CONFIGURATION_REQUIRED`. No public URL is ever generated.
5. **Queue package** (`packages/queue`) is BullMQ; `createQueue().add()` **throws** under `REDIS_DISABLED`, so every producer must try/catch and degrade inline (the pattern already used by AI replies and campaign dispatch).
6. **AI provider is OpenAI only** (`packages/ai/src/client.ts`), configured via `OPENAI_API_KEY` / `OPENAI_BASE_URL`. Reusable for the Realtime API with no new vendor.
7. **Knowledge/RAG** is pgvector via `semanticSearch` in `packages/ai/src/rag.ts`, scoped by `organizationId` (+ optional `knowledgeBaseId`). Voice scoping can reuse it.
8. **Sales engine to reuse** (from the marketing module on the parent branch): `SalesProduct`, `ProductsService.getAuthoritativePrice`, `DiscountService.computeOffer` / `computeDiscountMath` (5% platform cap), `LeadsService.transition`, `HotLeadService.notifyIfNeeded`, `DncService`, `CustomSoftwareRequest`, `EvolutionProvider.sendText` for WhatsApp followup.
9. **Entitlement pattern already established**: unused-before `Entitlement` table + `MarketingGuard`; the Voice module follows the identical shape with `AI_VOICE_MODULE` etc.
10. **Audit**: `AuditService.log()` exists and is wired by the marketing module; Voice reuses it.

## Consequences recorded before implementation

- Live telephony **cannot** be verified in this environment (no carrier account, no number, no public webhook URL). Everything is therefore built against provider abstractions with a Simulation adapter, and real providers are reported as `CONFIGURATION_REQUIRED`. No status will ever be displayed as connected/live without a real verification round-trip.
- Recording is architected but disabled, because storage is a stub (finding 4).
