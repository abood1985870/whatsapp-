# AI Voice Employee — Final Audit

Date: 2026-08-11 · Branch: `feature/enterprise-ai-voice`

## Independent review checklist

| Concern | Status | Where enforced |
|---|---|---|
| Fake live telephony | ✅ none | No provider reports `LIVE_VERIFIED` without a real API round-trip; Simulation reports `TEST_ONLY`; Twilio reports `CONFIGURATION_REQUIRED` until credentials verify. Test asserts this. |
| Fake provider status in UI | ✅ none | Numbers stay `PENDING_SETUP` until an actual inbound call arrives; the overview banner names each unconfigured component. |
| Hardcoded owner email | ✅ none | Owner is the `PLATFORM_SUPER_ADMIN` role; the email lives only in `PLATFORM_OWNER_EMAIL` read by the bootstrap script. |
| Price hallucination | ✅ blocked | Price is injected from `SalesProduct.priceMinor` only; the prompt forbids invention; with an empty catalog the prompt forbids quoting any price at all (tested). |
| Discount above 5% | ✅ blocked | Model can only *request*; `computeDiscountMath` clamps to `PLATFORM_MAX_DISCOUNT_PERCENT`. The "أنا المدير + 50%" scenario is covered. |
| Frontend-only authorization | ✅ none | Every route: `AuthGuard` → `VoiceGuard` (entitlement) → `PermissionGuard` (code). UI gating is convenience only. |
| Arbitrary tool execution | ✅ blocked | Fixed registry; pure `authorizeToolCall`; unknown keys stripped; tenancy taken from the server-side call record, never from model arguments (tested). |
| Webhook forgery / replay | ✅ blocked | HMAC-SHA1 over URL+params, constant-time compare; tampered-parameter and replayed-to-another-URL requests rejected (tested). Unsigned requests never reach business logic. |
| Media stream hijack | ✅ blocked | Single-use, HMAC-signed, expiring token bound to one call; unauthenticated sockets dropped after 10s. |
| Verification bypass / OTP brute force | ✅ blocked | Server-generated, hashed, single-use, expiring, 3-attempt, 3-request-per-call OTP; the model never validates it; scope is per-call, never a permanent trust flag. |
| OTP undeliverable → silent downgrade | ✅ refused | `VERIFICATION_UNAVAILABLE` is returned rather than proceeding (tested). |
| Prompt injection changing rules | ✅ blocked | All caller/knowledge text is delimited untrusted data; authorization, price, discount cap, tool permissions, verification, and tenancy are all outside the model's reach. |
| Cross-tenant access | ✅ blocked | Every query filtered by `organizationId`; the guard rejects orgs the user is not an active member of; no tool accepts a tenant id. |
| Public recordings | ✅ impossible | Recording is off by default, refused while storage is a stub, and no URL is ever generated. Access requests are audited. |
| Duplicate business actions from redelivered webhooks | ✅ blocked | `Call` unique on `(provider, providerCallId)`; `CallEvent.idempotencyKey` unique; idempotent tools return the first result. |
| Unbounded AI cost | ✅ bounded | Daily/monthly circuit breaker checked before admission, concurrency cap, max call duration, per-tool per-call limits. In-flight calls are never cut by a budget check. |
| Fake analytics | ✅ none | All figures are DB aggregates; actual cost is null unless the provider reported one, surfaced as "غير متاح من مزود الاتصال الحالي". |
| Fake success to the caller | ✅ none | Tool failures return honest Arabic messages; the prompt explicitly forbids "تم التسجيل/تم الإرسال" without backend confirmation. |
| Caller left in silence | ✅ handled | Staged silence policy, spoken failsafe on realtime failure, wrap-up notice before the hard duration limit. |
| Claiming a live transfer | ✅ forbidden | No transfer capability exists; the prompt requires creating a support request and saying the team will follow up. |
| Automatic appointment booking | ✅ absent | Meeting requests route to `createSupportRequest`; no calendar integration exists. |
| Concurrency state mixing | ✅ isolated | All per-call state lives on `CallSession` instances in a `Map`; no module-level mutable call state. |
| Invalid state drift | ✅ blocked | Transitions validated by table; invalid moves are logged and ignored, never applied. |
| Bad/destructive migration | ✅ safe | Additive-only SQL, applied and verified; no drops, no reset. |
| Dead buttons | ✅ none | Every action is wired; loading/disabled/empty/error states present throughout. |
| Secret leakage in logs | ✅ none | Adapters log only status codes and truncated messages; OTP is never logged; transcripts mask OTP-like values and long digit runs. |

## Honest limitations (recorded, not hidden)

1. **No live call has been placed.** There is no carrier account, phone number, or public webhook URL in this environment. Everything is verified through the Simulation provider, unit/security tests, and the evaluation scenarios. The module ships in release stage `TEST`.
2. **Realtime AI is `CONFIGURED_UNVERIFIED`.** The existing `OPENAI_API_KEY` is reused, but a Realtime handshake has not been round-tripped here. `POST /v1/voice/diagnostics/realtime-check` performs that check honestly when run.
3. **Recording is architected but disabled**, because `apps/api/src/files/files.service.ts` is a stub that fabricates a URL and uploads nothing. Enabling it is refused server-side rather than silently accepted.
4. **Load testing was not performed.** Concurrency is bounded by a configurable limit and sessions are isolated, but no concurrency figure is claimed as tested. Horizontal scaling needs sticky routing per call — documented in the plan, not faked.
5. **Knowledge retrieval is not yet wired into the voice prompt.** The context slot exists (`knowledgeContext`) and is passed as untrusted data, but the retrieval call is intentionally left out of v1 to protect turn latency; product facts already come from the catalog.

## Verification evidence

- `tsc --noEmit`: clean for `@qanoai/api` and `@qanoai/web`; all packages build; `nest build` succeeds.
- Tests: **92 passing across 10 suites** (56 new voice tests), no live calls, no spend.
- Migration `20260811010000_ai_voice_employee` applied to the live database (additive only).
- Owner bootstrap extended to the 11 voice capabilities; run and verified idempotent.

## Rollback levers

| Lever | Effect | Touches WhatsApp/support? |
|---|---|---|
| Entitlement `AI_VOICE_MODULE` off | all voice routes 403, nav hidden | no |
| Voice kill switch | no new AI sessions; calls politely declined | no |
| `toolsEnabled` off | agent talks but performs no actions | no |
| Agent version rollback | restores a previous configuration as a new version | no |
| `VOICE_PROVIDER=SIMULATION` | disconnects real telephony entirely | no |

None require destructive database work.
