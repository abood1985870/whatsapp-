# QanoAI Deployment Guide

## URLs
- **Frontend (Vercel)**: https://your-project.vercel.app
- **API Gateway (Railway)**: https://your-api.up.railway.app
- **Realtime WebSocket (Railway)**: https://your-realtime.up.railway.app
- **Worker (Railway)**: (Background service, no public URL)

## Environment Variables

These variables must be set securely in the deployment platforms. **NEVER** expose them in source code or the frontend if they are sensitive.

### Vercel (Frontend)
- `NEXT_PUBLIC_API_URL`: `https://your-api.up.railway.app/v1`
- `NEXT_PUBLIC_REALTIME_URL`: `https://your-realtime.up.railway.app`

### Railway (Backend - API, Worker, Realtime)
- `NODE_ENV`: `production`
- `DATABASE_URL`: Supabase Postgres connection string with `sslmode=require`
- `REDIS_URL`: Managed Redis URL from Railway, Upstash, or Redis Cloud
- `AUTH_SECRET`: Random 64-char string for JWT signing
- `AUTH_ENCRYPTION_KEY`: Random 32-char string for token encryption
- `CREDENTIAL_ENCRYPTION_KEY`: Random 32-char string for WhatsApp sessions encryption
- `OPENAI_API_KEY`: Your OpenAI API key
- `EVOLUTION_API_URL`: Your Evolution API endpoint
- `EVOLUTION_API_KEY`: Your Evolution global API key
- `S3_ENDPOINT`: Storage URL (MinIO, AWS S3, Cloudflare R2)
- `S3_ACCESS_KEY_ID`: Storage Access Key
- `S3_SECRET_ACCESS_KEY`: Storage Secret Key
- `S3_BUCKET_PRIVATE`: e.g. `qanoai-private`
- `S3_REGION`: e.g. `us-east-1`
- `SMTP_HOST`: e.g. `smtp.resend.com`
- `SMTP_PORT`: e.g. `465`
- `SMTP_USER`: SMTP username
- `SMTP_PASSWORD`: SMTP password
- `EMAIL_FROM`: `noreply@yourdomain.com`

## How to Update

1. **Push code to GitHub Main branch**.
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```
2. **Railway** will detect the change and auto-deploy the API, Worker, and Realtime services.
3. **Vercel** will detect the change and auto-deploy the Next.js frontend.

## Database Migrations
If your update includes Prisma schema changes:
1. Go to your **Railway** dashboard -> **API Service** -> **Shell**.
2. Run `npx prisma migrate deploy` to safely apply changes to the production database.

The production start script expects `DATABASE_URL` and `REDIS_URL` to already exist in Railway variables. It does not start local Postgres or Redis inside the app container.

## Troubleshooting

- **CORS Issues on Frontend**: Ensure `NEXT_PUBLIC_API_URL` exactly matches the Railway API URL without a trailing slash (e.g. `.../v1`). Ensure `APP_URL` on the backend matches the Vercel URL exactly.
- **WebSocket Disconnections**: Verify `NEXT_PUBLIC_REALTIME_URL` matches the Railway Realtime URL securely (`https://`).
- **Cannot generate OpenAI response**: Ensure the `OPENAI_API_KEY` is injected correctly in Railway and is valid (not expired or out of credits).
- **Evolution WhatsApp API fails**: Ensure `EVOLUTION_API_URL` and keys are correctly placed. Verify if network traffic from Railway can reach your Evolution API server.
