# QanoAI Deployment Guide

## Prerequisites
- Node.js (v20+)
- pnpm (v9+)
- Docker & Docker Compose
- Windows Server or Ubuntu/Debian Linux

## 1. Environment Configuration
Copy the sample environment file and update it with your secrets:
```bash
cp .env.example .env
```
Ensure you generate secure keys for `AUTH_SECRET`, `AUTH_ENCRYPTION_KEY`, and `CREDENTIAL_ENCRYPTION_KEY`.

## 2. Start Infrastructure
Start PostgreSQL, Redis, MinIO, and the Evolution API via Docker Compose:
```bash
docker-compose -f docker-compose.production.yml up -d
```

## 3. Database Migration
Apply the Prisma schema to the database:
```bash
pnpm --filter database run prisma migrate deploy
pnpm --filter database run prisma generate
```

## 4. Building the Application
Build all monorepo packages and apps:
```bash
pnpm run build
```

## 5. Running the Services
We recommend using a process manager like PM2 or running the provided Windows `.cmd` scripts.

To start everything simultaneously in production mode (requires PM2 setup not covered here), you can start the built outputs in `dist/` or `.next/` directories.

For simple deployment, run the provided Windows script:
```cmd
scripts\start-qanoai.cmd
```

## 6. Reverse Proxy (Nginx / IIS)
Expose the following ports via your reverse proxy:
- **Port 3000**: Main Next.js UI (`app.qanoai.com`)
- **Port 3001**: NestJS API (`api.qanoai.com`)
- **Port 3002**: Socket.IO Realtime (`realtime.qanoai.com`)
