# AI Sales & Marketing Module — Final Audit

Date: 2026-08-11 · Branch: `feature/enterprise-ai-sales`

## Independent review checklist (from the directive)

| Concern | Status | Where enforced |
|---|---|---|
| Hardcoded owner email in app code | ✅ none | Owner resolved via `PLATFORM_SUPER_ADMIN` role + `PLATFORM_OWNER_EMAIL` env in bootstrap only |
| Hardcoded/hallucinated prices | ✅ none | Price only from `SalesProduct.priceMinor`; sales agent prompt forbids inventing; reply validator rejects non-official SAR amounts |
| Discount above 5% | ✅ blocked | `computeDiscountMath` clamps to `PLATFORM_MAX_DISCOUNT_PERCENT`; unit-tested against 50% injection |
| Frontend-only authorization | ✅ none | Every route behind `AuthGuard` + `MarketingGuard` (entitlement) + `PermissionGuard`; UI hiding is convenience only |
| DNC bypass | ✅ blocked | DNC re-checked server-side inside `MarketingSendService` immediately before each send; queue payload never authority |
| Duplicate send / race | ✅ handled | Atomic `QUEUED→SENDING` claim via conditional `updateMany`; campaign start guard via conditional status update; reply marks recipient `REPLIED` before send decision |
| Reply-during-send | ✅ handled | Inbound sales branch flips recipient to `REPLIED` atomically; SENDING claim excludes replied rows; post-claim campaign re-check |
| Second inbox | ✅ avoided | Campaign replies flow through the existing `handleIncomingMessage`; reuse existing Conversation/Message tables |
| Global sales mode leaking into support | ✅ avoided | Sales branch runs only when `conversation.metadata.salesContext` is present; regression test proves fall-through |
| Unsafe website fetch (SSRF) | ✅ blocked | `SafeWebsiteFetcher` validates protocol, DNS-resolved IPs (RFC1918/CGNAT/link-local/metadata/IPv6), redirects, size, content-type; security test suite |
| Prompt injection business-rule bypass | ✅ blocked | All customer/website/lead text wrapped in untrusted-data tags; price/discount/URL never from model; validators reject unauthorized numbers & URLs |
| Unbounded AI/API cost | ✅ bounded | `maxLeadsPerCampaign`, canary cap, per-attempt limits, daily/monthly AI budget circuit breaker pauses campaign |
| Kill switch disables all WhatsApp | ✅ avoided | Kill switch checked only in marketing send path; support/provider untouched |
| Dead buttons | ✅ none | All actions wired to endpoints; loading/disabled/empty/error states present |
| Empty catch / ignored errors | ✅ none | Catches log or set explicit failure state; `.catch(() => undefined)` used only for best-effort telemetry |
| Bad/destructive migration | ✅ safe | Additive-only SQL; applied and verified; no drops/resets |
| Missing tenant filter | ✅ scoped | Every query filtered by `organizationId`; guard rejects orgs the user isn't an active member of |
| Money as float | ✅ integer | All money in integer minor units (halalas) |
| Fake analytics | ✅ real | Analytics from DB aggregates; Delivered/Read shown only when provider populated them, else "غير متاح من مزود الاتصال الحالي" |

## Known considerations (intentional, documented)

1. **Inline dispatch fallback.** When `REDIS_DISABLED`, personalization and sending run as bounded inline loops in the API process (same pattern as the existing AI-reply inline fallback). A dedicated `CAMPAIGN_DISPATCH` worker processor is the natural next step when Redis is enabled in production; `CampaignDispatchService.prepareBatch/dispatchBatch` are already worker-ready.
2. **Conversation reuse.** If a campaign recipient already has an open conversation, the send attaches `salesContext` to it. Eligibility already excludes previously-contacted leads, so overlap with an active support case is rare; the sales handler also fails open. Revisit if multi-open-conversation support is added.
3. **Google Places provider** is `CONFIGURATION_REQUIRED` until `GOOGLE_PLACES_API_KEY` is set; the Mock provider (`TEST_ONLY`) is the default and drives all simulation/tests. No live discovery is ever faked.

## Verification evidence

- `tsc --noEmit`: clean for `@qanoai/api` and `@qanoai/web`; all shared packages build.
- Tests: 36 passing across 6 suites (`--testPathPattern=marketing`).
- Migration `20260811000000_ai_sales_marketing` applied to the live database (additive).
- Owner bootstrap run and verified idempotent (second run: "everything already in place").

## Rollback

- Disable module: set org entitlement `AI_SALES_MODULE` off → all routes 403, nav hidden. Support untouched.
- Stop sends instantly: marketing kill switch in settings.
- Discovery off: settings `discoveryProvider = MOCK`.
- None of these touch WhatsApp connectivity, the inbox, or existing AI support.
