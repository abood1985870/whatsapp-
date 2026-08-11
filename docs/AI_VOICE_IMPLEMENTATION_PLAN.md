# AI Voice Employee — Implementation Plan

Branch `feature/enterprise-ai-voice` (from `46a9f86` on `feature/enterprise-ai-sales`).
Companion docs: `AI_VOICE_BASELINE.md`, `VOICE_PROVIDER_DECISION.md`, `AI_VOICE_EXTERNAL_SETUP_REQUIRED.md`.

## Existing architecture (verified, not assumed)

NestJS API (`/v1/*`), Next 14 App Router web (RTL Arabic), BullMQ worker, Socket.IO realtime service, all fronted by `gateway.js`. Prisma/PostgreSQL single schema. WhatsApp through Evolution API. AI through OpenAI (`packages/ai`). RBAC = DB-seeded permission codes + `PermissionGuard`; platform owner = `PLATFORM_SUPER_ADMIN` role. Entitlements per organization in the `Entitlement` table, guarded by the pattern established in `apps/api/src/marketing/guards/marketing.guard.ts`. Sales engine (products, price authority, 5% discount cap, leads, hot leads, DNC, custom-software requests) lives in `apps/api/src/marketing`.

## Voice architecture

```
PSTN caller
   │
   ▼
Telephony provider (Twilio adapter | Simulation adapter)
   │  signed webhook: incoming call
   ▼
VoiceWebhookController ──► CallOrchestrator
   │                            │
   │  bidirectional μ-law 8kHz  │ creates Call + state machine
   ▼                            ▼
/v1/voice/media-stream  ◄──► RealtimeAIProvider (OpenAI Realtime, g711_ulaw)
        (raw WS)                 │ function calls
                                 ▼
                          VoiceToolEngine ──► authorization pipeline ──► existing services
                                                (products, discount, leads, support, WhatsApp)
```

Audio never transcodes: Twilio Media Streams and OpenAI Realtime both speak 8 kHz G.711 μ-law, base64-framed.

## Call lifecycle (explicit state machine)

`RINGING → CONNECTING → AI_SESSION_STARTING → ACTIVE → (LISTENING ⇄ THINKING ⇄ SPEAKING ⇄ TOOL_EXECUTION ⇄ VERIFYING) → ENDING → COMPLETED`
Terminal alternatives: `DISCONNECTED`, `FAILED`. Transitions are validated by a single table; invalid transitions are rejected and logged rather than silently applied. Every transition writes a `CallEvent`.

## Telecom architecture

- **Existing number:** documented forwarding or SIP/BYOC routes; status stays `PENDING_SETUP` until a real inbound call is observed. Never displayed as connected on configuration alone.
- **New number:** provider `listAvailableNumbers()` / `provisionNumber()` exist behind the `NEW_NUMBER` capability, but provisioning is an explicit owner action and is refused unless `VOICE_NEW_NUMBER_PROVISIONING` is on. The software never buys automatically.

## Provider abstraction

`VoiceProvider` — `getCapabilities`, `validateConfiguration`, `getHealth`, `listAvailableNumbers`, `provisionNumber`, `releaseNumber`, `answerCall`, `rejectCall`, `endCall`, `startRecording`, `stopRecording`, `getCallStatus`, `validateWebhook`, `buildAnswerInstruction`.
`RealtimeAIProvider` — `createSession`, `updateSession`, `sendAudio`, `commitAudio`, `cancelSpeech`, `sendToolResult`, `close`, `getUsage`, with an event stream (`audio`, `transcript`, `tool_call`, `speech_started`, `response_done`, `error`).
Capabilities are data (`EXISTING_NUMBER`, `NEW_NUMBER`, `SIP`, `MEDIA_STREAMING`, `BIDIRECTIONAL_AUDIO`, `RECORDING`, `DTMF`, `CALLER_ID`, `WEBHOOK_SIGNATURE`, `REALTIME_TRANSCRIPTION`) so the UI can only offer what the configured provider actually supports.

Adapters: `SimulationVoiceProvider` (TEST_ONLY, drives the whole system without telephony), `TwilioVoiceProvider` (CONFIGURATION_REQUIRED until credentials verify). Provider SDK/HTTP details never leak outside `apps/api/src/voice/providers/`.

## Database model (additive only)

`VoiceAgent`, `VoiceAgentVersion`, `VoiceNumber`, `VoiceProviderConfig`, `Call`, `CallEvent`, `CallTranscriptTurn`, `CallToolExecution`, `VoiceUsageRecord`, `VerificationSession`, `VoiceSettings`, `VoiceEvaluationRun`, `VoiceEvaluationResult`. Money in integer minor units; cost fields separate `estimated` from `actual`. No existing table is altered.

## Unified customer identity

One `Contact`/`Lead` across channels. Inbound caller number is normalized with the **legacy** `normalizePhone` for `Contact` lookup (preserving existing inbox identity) and with `normalizePhoneStrict` for `Lead`/DNC identity — exactly the dual-normalizer rule the marketing module established. A caller who was messaged by a campaign resolves to the same Lead, so the voice employee sees the right product and funnel state. Customer 360 is a *view* assembled from existing rows (messages, campaign recipients, calls) — no duplicated records.

## Knowledge architecture

Reuses `semanticSearch`/`assembleContext` from `packages/ai`. A `voiceScope` filter (`WHATSAPP | VOICE | BOTH`) restricts what the voice agent may retrieve. Latency controls: top-K cap, relevance threshold, context character budget, and per-call caching of public product facts only (never customer-specific data). Retrieved text is untrusted data and is wrapped as such in the prompt.

## Tool engine

Registry entries declare `id, name, description, enabled, inputSchema, outputSchema, timeoutMs, verificationLevel, requiresConfirmation, rateLimit, idempotency, sensitivity`. Execution pipeline: model tool-call → schema validation → tenant context from the **server-side call record** (never from model arguments) → tool-enabled check → verification policy → business rules → idempotency key → execute → audit → sanitized result. Tools: `lookupProduct`, `createLead`, `updateLead`, `captureDetails`, `createSupportRequest`, `createCustomSoftwareRequest`, `requestDiscountOffer`, `sendWhatsAppFollowup`, `sendProductLink`, `sendPurchaseLink`.

## Verification

`NO_VERIFICATION | BASIC_VERIFICATION | OTP_REQUIRED`. OTP is server-generated, hashed at rest, single-use, expiring, attempt- and rate-limited, and **never** validated by the model. A success creates a `VerificationSession` scoped to (call, contact, action, expiry) — never a permanent trust flag. Without an SMS provider, `OTP_REQUIRED` tools are refused rather than bypassed.

## Sales architecture

No new sales rules. Price comes only from `ProductsService.getAuthoritativePrice`. Discounts come only from `DiscountService.computeOffer` (hard 5% platform ceiling, integer math). Outcomes map onto the existing lead lifecycle; hot leads reuse `HotLeadService` deduplication; custom software reuses `CustomSoftwareRequest`; opt-out reuses `DncService`. Voice is a channel, not a second sales system.

## Cost architecture

Per call: telephony seconds + rate, realtime AI input/output tokens and audio seconds, transcription, storage, followup. `estimatedCostMinor` always; `actualCostMinor` only when the provider reports it — the two are never conflated. Aggregated into `VoiceUsageRecord` per organization. Circuit breaker: daily/monthly caps and spike detection block *new* sessions and notify the owner; in-flight calls are never cut mid-sentence by a budget check.

## Reliability

Per-call isolation (no module-level mutable call state; a `Map<callId, session>` owned by the orchestrator). Provider webhooks are idempotent by `(provider, providerEventId)` unique key. Tool failures produce an honest "couldn't complete that" instead of a fabricated success. Model disconnects trigger bounded reconnect, then a safe spoken fallback and graceful end. Silence policy is staged. Loop detection bounds repeated questions/tool failures. Max call duration attempts a natural wrap-up before ending.

## Security

Webhook signature verification (Twilio HMAC-SHA1 over URL+params, constant-time compare) plus timestamp/replay checks; unsigned requests rejected — caller ID and call status are never trusted from an unsigned body. Media-stream WebSocket authenticated by a short-lived, single-use stream token bound to the call. Tenant from server session/call record, never from client or model input. Prompt injection cannot alter authorization, price, 5% cap, tool permissions, verification, knowledge scope, or tenancy. Recordings/transcripts are permission-checked and audited.

## Multi-tenancy & privacy

Every voice row carries `organizationId`; every query filters on it; the guard rejects organizations the user is not an active member of. Per-organization agent, number, knowledge, tools, style, recording, verification, hours, notifications — no global leakage. Transcript PII masking, OTP never logged, secrets never logged, retention fields present for future policy enforcement.

## Analytics

Real aggregates only: calls, answered, failed, average duration, outcome distribution, support requests, followups, latency percentiles, provider/AI error counts, estimated vs actual cost. Anything the provider cannot report is displayed as "غير متاح من مزود الاتصال الحالي" rather than invented.

## Deployment, scaling, rollback

`gateway.js` gains a WS-enabled proxy for `/v1/voice/media-stream` (additive; existing routes untouched). Sessions are in-process, so horizontal scaling requires sticky routing per call — documented, not faked. Rollback levers: `AI_VOICE_MODULE` entitlement off, voice kill switch, per-feature flags, agent-version rollback, prompt-version rollback, provider switch to Simulation. None require destructive DB work.

## Test strategy

Unit: state-machine transitions, μ-law/base64 framing, tool authorization decisions, verification policy, cost math, silence/loop policy, capability gating, webhook signature verification. Integration: full simulated call through orchestrator + tool engine + sales services. Security: cross-tenant access, webhook forgery/replay, prompt injection, discount bypass, verification bypass, OTP brute force. Evaluation harness: structured sales scenarios with explicit expected/forbidden behaviour, scored and stored. No test ever places a real call.

## Commercial SaaS readiness

Entitlements + capabilities + usage metering + per-tenant limits + staged rollout (`TEST → INTERNAL → CANARY → PRODUCTION`) mean enabling a second organization is configuration, not development.
