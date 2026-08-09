# QanoAI WhatsAppSupport Setup

## Required local tools

- Node.js 20+
- pnpm 9+
- Docker Desktop

## Required environment variables

Copy `.env.example` to `.env`, then replace placeholder secrets before running production-like environments.

### Application URLs

- `APP_URL`: frontend URL, for example `http://localhost:3000`.
- `API_URL`: API URL, for example `http://localhost:3001`.
- `REALTIME_URL`: realtime server URL, for example `http://localhost:3002`.
- `CORS_ORIGINS`: comma-separated allowed browser origins, for example `https://app.example.com,https://admin.example.com`.

### Database and Redis

- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_URL`: Redis connection string used by queues and realtime broadcasting.

### Supabase

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: public-safe Supabase publishable key for browser/mobile clients.
- `SUPABASE_SECRET_KEY`: server-only Supabase secret key. Never expose it through `NEXT_PUBLIC_` variables or client bundles.
- `SUPABASE_JWKS_URL`: Supabase Auth JWKS endpoint for JWT verification.

### Authentication and encryption

- `AUTH_SECRET`: at least 32 characters. Generate a strong random value.
- `AUTH_ENCRYPTION_KEY`: at least 32 characters. Generate a strong random value.
- `CREDENTIAL_ENCRYPTION_KEY`: at least 32 characters. Generate a strong random value.

### Evolution API

- `EVOLUTION_API_URL`: base URL of the Evolution API server.
- `EVOLUTION_API_KEY`: API key from your Evolution API deployment.
- `EVOLUTION_WEBHOOK_BASE_URL`: public API webhook URL that Evolution can call.
- `EVOLUTION_WEBHOOK_SECRET`: optional HMAC secret if your Evolution webhook setup signs payloads.

### Object storage

- `S3_ENDPOINT`: S3-compatible endpoint, such as MinIO locally.
- `S3_REGION`: storage region.
- `S3_BUCKET_PRIVATE`: private bucket name.
- `S3_ACCESS_KEY_ID`: S3/MinIO access key.
- `S3_SECRET_ACCESS_KEY`: S3/MinIO secret key.

### AI provider

- `OPENAI_API_KEY`: OpenAI API key or compatible provider key.
- `OPENAI_BASE_URL`: optional OpenAI-compatible API base URL.
- `AI_DEFAULT_CHAT_MODEL`: default chat model.
- `AI_DEFAULT_EMBEDDING_MODEL`: default embedding model.
- `AI_REQUEST_TIMEOUT_MS`: AI request timeout.

### Email

- `EMAIL_FROM`: sender address.
- `SMTP_HOST`: SMTP host.
- `SMTP_PORT`: SMTP port.
- `SMTP_USER`: SMTP username if required.
- `SMTP_PASSWORD`: SMTP password if required.

### Feature flags

- `FEATURE_BILLING_ENABLED`: enables billing features when implemented.
- `FEATURE_N8N_ENABLED`: enables n8n integration paths when implemented.
- `N8N_WEBHOOK_BASE_URL`: n8n webhook base URL.

## Local boot sequence

```bash
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Known setup gaps

- A first Prisma migration exists at `prisma/migrations/20260809000000_init/migration.sql`, but it still needs to be tested against a fresh PostgreSQL database.
- File storage code still needs full S3-compatible upload/download implementation before production.
- `pnpm typecheck` currently fails in this environment with Windows exit code `3221225781`; this needs a separate tooling pass.
