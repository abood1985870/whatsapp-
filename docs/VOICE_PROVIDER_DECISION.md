# Voice Provider Decision

Date: 2026-08-11 · Status: **PROVIDER SELECTION REQUIRES CONFIGURATION**

No telephony provider exists in the repository or environment (verified: no SDK, no env var, no config row). This document records the evaluation and the resulting architecture decision. **No provider is silently assumed.**

## Requirement-driven evaluation

Criteria are the ones this product actually needs, not generic popularity.

| # | Requirement | Twilio | Telnyx | Vonage | Local SA SIP trunk |
|---|---|---|---|---|---|
| 1 | Saudi Arabia reachability (inbound to a KSA-reachable number) | via SIP/BYOC or intl. number | via SIP/BYOC or intl. number | similar | native |
| 2 | **+966 local number provisioning to a foreign entity** | ❌ not generally available (CITC regulation, local entity/licence required) | ❌ same | ❌ same | ✅ (local contract) |
| 3 | Existing-number integration | ✅ Elastic SIP Trunking / BYOC | ✅ SIP trunking | ✅ | ✅ native |
| 4 | SIP support | ✅ mature | ✅ mature | ✅ | ✅ |
| 5 | Call forwarding compatibility | ✅ (forward KSA number → provider number) | ✅ | ✅ | n/a |
| 6 | Programmable inbound call control | ✅ TwiML / webhooks | ✅ Call Control API | ✅ NCCO | ❌ needs own media server |
| 7 | **Bidirectional streaming media over WebSocket** | ✅ `<Connect><Stream>` (bidirectional, 8 kHz μ-law base64) | ✅ Media Streaming (bidirectional) | ✅ WebSocket | ❌ build yourself (Asterisk/FreeSWITCH) |
| 8 | Recording | ✅ | ✅ | ✅ | depends |
| 9 | DTMF events | ✅ | ✅ | ✅ | depends |
| 10 | Webhook signature verification | ✅ `X-Twilio-Signature` (HMAC-SHA1 over URL+params) | ✅ Ed25519 public-key signing | ✅ JWT | n/a |
| 11 | Caller ID | ✅ | ✅ | ✅ | ✅ |
| 12 | Transparent pricing | ✅ | ✅ (generally cheaper) | ✅ | contract |
| 13 | Concurrency/scaling | ✅ high | ✅ high | ✅ | own capacity |
| 14 | Production maturity / docs / SDK | ✅ best-in-class | ✅ good | ✅ ok | n/a |
| 15 | Integration complexity for this repo | low (plain HTTP + WS, no SDK needed) | low | medium | very high |

## Decision

- **SELECTED_PROVIDER (primary adapter): Twilio Programmable Voice + Media Streams.**
  Reason: it is the only candidate that gives, in one documented product, inbound call control by webhook, **bidirectional** WebSocket media at 8 kHz μ-law (which matches the OpenAI Realtime `g711_ulaw` format exactly, so **zero transcoding**), Elastic SIP Trunking for connecting a customer's existing Saudi number, and a well-specified webhook signature scheme. It also needs no SDK — plain HTTPS + WebSocket — so no heavy dependency enters the repo.
- **ALTERNATIVE_PROVIDER: Telnyx.** Functionally equivalent for our capability set, typically lower per-minute cost, Ed25519 webhook signing. The adapter interface is designed so Telnyx can be added without touching call orchestration, tools, or sales logic.
- **SELECTION_REASON summary:** best capability match per requirement 7 + 3 + 10 at the lowest integration cost, with a credible second source.

## Explicit honesty constraints

1. **A +966 number will not be provisioned by API.** For Saudi Arabia the realistic routes are (a) keep the customer's existing KSA number and **forward** it to a provider number, or (b) terminate the customer's existing number into the provider via **SIP trunk / BYOC**, or (c) obtain a local number through a licensed Saudi operator and route it by SIP. The product must therefore never advertise "buy a Saudi number in one click".
2. **Nothing is purchased automatically.** Number provisioning is an owner-initiated, explicitly-confirmed action; the code never buys a number on its own.
3. Until credentials and a public webhook URL exist, the provider status is `CONFIGURATION_REQUIRED` and the UI must show it as such.

## Realtime AI provider

- **SELECTED: OpenAI Realtime API** (`gpt-realtime` family) over WebSocket.
  Reason: the repo already depends on OpenAI (`packages/ai/src/client.ts`, `OPENAI_API_KEY`) so no new vendor, no new billing relationship; it supports `g711_ulaw` input **and** output — byte-identical to Twilio Media Streams — plus server-side VAD turn detection, speech-interruption events for barge-in, and native function calling for the tool engine.
- **ALTERNATIVE:** a pipeline of separate STT → LLM → TTS providers. Rejected for v1: materially higher latency and far more moving parts, for no capability we need.

## New dependencies this decision implies

| Package | Why it cannot be avoided | Scope |
|---|---|---|
| `ws` | Node has no built-in WebSocket **client**; required both to connect to OpenAI Realtime and to accept provider media streams. `@nestjs/platform-socket.io` speaks the Socket.IO protocol, not raw WS, so it cannot be used here. | `apps/api` runtime |
| `@types/ws` | types for the above | `apps/api` dev |

No other package is added. No major version of Next/React/Prisma/Nest/Tailwind is changed.
