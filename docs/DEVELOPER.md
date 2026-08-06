# Developer Onboarding Guide

Welcome to the QanoAI Monorepo!

## Architecture
QanoAI uses a **Modular Monolith** architecture powered by **TurboRepo** and **pnpm workspaces**.

### Apps
- `apps/api`: The core NestJS backend. Serves REST endpoints.
- `apps/web`: The Next.js 14 App Router frontend.
- `apps/worker`: BullMQ background job processors for AI generation and WhatsApp handling.
- `apps/realtime`: Socket.IO server for bi-directional live updates to the UI.

### Packages
- `packages/ai`: Contains the OpenAI initialization and RAG logic (`pgvector`).
- `packages/database`: Prisma schema and client generation.
- `packages/validation`: Zod schemas shared across the frontend and backend.
- `packages/config`: Type-safe environment variable parsing.

## Daily Workflow
1. Start infrastructure: `docker-compose up -d`
2. Run development servers: `pnpm dev`
3. The UI is available at `http://localhost:3000`
4. The API is available at `http://localhost:3001`
5. The Swagger documentation is at `http://localhost:3001/api/docs`

## Adding a new Prisma Model
1. Edit `packages/database/prisma/schema.prisma`
2. Run `pnpm --filter database run prisma format`
3. Run `pnpm --filter database run prisma migrate dev --name your_migration_name`
4. Run `pnpm --filter database run prisma generate`
