# AI Voice Employee — External Setup Required

Date: 2026-08-11

Status vocabulary: `LIVE_VERIFIED` · `CONFIGURED_UNVERIFIED` · `CONFIGURATION_REQUIRED` · `TEST_ONLY` · `NOT_REQUIRED`

**No credential in this document is fabricated.** Every value below is a placeholder the owner must supply.

| Service | Purpose | Status |
|---|---|---|
| Simulation voice provider | Development, tests, evaluation harness | `TEST_ONLY` (built, works today) |
| Twilio Programmable Voice | Real inbound calls + media streaming | `CONFIGURATION_REQUIRED` |
| Phone number (KSA) | The number customers dial | `CONFIGURATION_REQUIRED` |
| OpenAI Realtime API | The voice brain | `CONFIGURED_UNVERIFIED` (key exists for chat; Realtime access not yet round-tripped) |
| Object storage (S3/MinIO) | Call recordings | `CONFIGURATION_REQUIRED` — repo storage is a stub, so recording stays disabled |
| Redis | Durable queues for followups/summaries | `CONFIGURATION_REQUIRED` on this machine (inline fallback works without it) |
| SMS provider (OTP) | Verification for private customer data | `CONFIGURATION_REQUIRED` — OTP delivery unavailable until set |
| WhatsApp (Evolution API) | Post-call followup messages | reuses the existing connection — `NOT_REQUIRED` (already part of the platform) |

---

## 1. Twilio Programmable Voice — `CONFIGURATION_REQUIRED`

**Purpose:** receive inbound phone calls and stream call audio to/from QanoAI.

**Owner steps**
1. Create an account at `https://www.twilio.com` and complete business verification.
2. From the Console copy **Account SID** and **Auth Token**.
3. Ensure the deployment has a **publicly reachable HTTPS URL** (Railway domain works). Twilio must reach it; `localhost` will not work.

**Environment variables to set (server-side only, never in the browser):**

```
VOICE_PROVIDER=TWILIO
TWILIO_ACCOUNT_SID=<from Twilio Console>
TWILIO_AUTH_TOKEN=<from Twilio Console>
VOICE_PUBLIC_BASE_URL=https://<your-public-domain>
```

**Twilio Console configuration** — on the phone number, set the incoming-call webhook to:

```
HTTP POST   https://<your-public-domain>/v1/voice/webhooks/twilio/incoming
```

Status callback (optional but recommended):

```
HTTP POST   https://<your-public-domain>/v1/voice/webhooks/twilio/status
```

Media stream endpoint used by the returned TwiML (no manual step; documented for firewall rules):

```
WSS         wss://<your-public-domain>/v1/voice/media-stream
```

**Connection test:** `POST /v1/voice/diagnostics/provider-check` → expects `{ status: "LIVE_VERIFIED" }` only after credentials validate against Twilio's API.
**Until configured:** voice calls cannot be received; the module runs in Simulation mode only.

---

## 2. Phone number — `CONFIGURATION_REQUIRED`

Two supported routes. **Neither is automatic, and no number is ever purchased by the software.**

### Route A — existing Saudi number (recommended)
Keep the business's current +966 number and either:
- **Call forwarding:** configure unconditional/busy/no-answer forwarding at the Saudi operator (STC / Mobily / Zain / Salam) to the provider number; or
- **SIP trunk / BYOC:** terminate the existing number into Twilio Elastic SIP Trunking (requires the operator to support SIP termination and a signed arrangement).

Owner supplies: the number, and confirmation that forwarding/SIP is live. The number stays `بانتظار الإعداد` in QanoAI until a real inbound test call is observed.

### Route B — new provider number
Buy a number in the Twilio Console. **Note:** local +966 numbers are generally not issuable to a foreign entity under CITC rules; an international number will reach the AI but is a poor customer-facing choice for a Saudi business. See `docs/VOICE_PROVIDER_DECISION.md` §"Explicit honesty constraints".

---

## 3. OpenAI Realtime API — `CONFIGURED_UNVERIFIED`

**Purpose:** the realtime speech-to-speech brain.

`OPENAI_API_KEY` already exists in this deployment for chat/embeddings. Realtime is a different endpoint and may need entitlement on the account.

```
OPENAI_API_KEY=<existing key, reused>
VOICE_REALTIME_MODEL=gpt-realtime          # optional override
VOICE_REALTIME_URL=wss://api.openai.com/v1/realtime   # optional override
```

**Connection test:** `POST /v1/voice/diagnostics/realtime-check` opens a Realtime session, waits for `session.created`, then closes. It reports `LIVE_VERIFIED` only on a real successful handshake.

---

## 4. Object storage for recordings — `CONFIGURATION_REQUIRED`

`apps/api/src/files/files.service.ts` currently **fabricates** a `http://localhost:9000/...` URL and uploads nothing. Therefore:

- Call recording is **OFF by default** and gated behind `VOICE_RECORDING_ENABLED` + the `VOICE_RECORDINGS` entitlement.
- Enabling it without real storage is refused by the API rather than silently "succeeding".
- When storage is implemented, recordings must be private objects served through short-lived signed URLs with an audit entry per access. **Never a public URL.**

```
S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET_PRIVATE=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

---

## 5. SMS provider for OTP — `CONFIGURATION_REQUIRED`

Needed only when a Voice tool is configured with verification level `OTP_REQUIRED` (accessing private customer/order data). Until a provider is configured, `OTP_REQUIRED` tools are **refused server-side** — the AI is told the action is unavailable, and it never claims the customer was verified.

```
VOICE_OTP_PROVIDER=<e.g. TWILIO_SMS>
VOICE_OTP_SENDER_ID=<approved alphanumeric sender or number>
```

---

## 6. Redis — `CONFIGURATION_REQUIRED` (optional)

Post-call summaries and WhatsApp followups enqueue to BullMQ when available and fall back to bounded inline execution when `REDIS_DISABLED=true`, mirroring the existing AI-reply behaviour. Set `REDIS_URL` for durable retries in production.

---

## What works today without any of the above

- Full call state machine, tool authorization pipeline, sales logic, discount enforcement, transcripts, summaries, analytics, cost accounting, kill switch, entitlements, UI — all exercised end-to-end through the **Simulation provider** (`TEST_ONLY`) and the evaluation harness. No paid resource is touched, and no real customer is ever called.
