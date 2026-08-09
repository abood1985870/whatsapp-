# QanoAI WhatsAppSupport Decisions

## 2026-08-09

### CORS configuration

Decision: add `CORS_ORIGINS` as a comma-separated environment variable. In development the system allows local origins by default; in production it falls back to `APP_URL` if `CORS_ORIGINS` is not set.

Reason: production CORS must be explicit, while local development should remain easy to run.

### Evolution webhook signature

Decision: support optional HMAC-SHA256 verification through `EVOLUTION_WEBHOOK_SECRET`. If the secret is configured, incoming Evolution webhooks must include a matching signature in `x-evolution-signature`, `x-hub-signature-256`, or `x-signature`.

Reason: some Evolution deployments may not emit a signed webhook by default. Making the secret opt-in lets existing local development continue, while production can enforce signed inbound webhooks.

### Evolution API request shapes

Decision: align the provider with the current Evolution API quickstart/reference request shapes: `POST /instance/create`, `GET /instance/connect/{instance}`, `GET /instance/connectionState/{instance}`, `POST /message/sendText/{instance}`, flat `POST /message/sendMedia/{instance}`, and flat `POST /webhook/set/{instance}`.

Reason: the current docs show flat webhook and media payloads. Keeping these shapes in the provider reduces integration drift.

### Realtime tenant context

Decision: realtime no longer trusts `organizationId` and `role` claims as required JWT fields. It verifies the JWT, loads the user and active memberships from PostgreSQL, then attaches the active organization to the socket.

Reason: the API currently issues JWTs with `sub/email`, so realtime must derive tenant context from trusted server-side data.

### Phase ordering

Decision: start post-audit remediation with security and operability fixes before broad feature work.

Reason: tenant isolation, CORS, readiness, and webhook validation reduce production risk across many later features.
