# AI Sales Module — Baseline Record

Date: 2026-08-11

## Phase 0 — Workspace Safety

- Branch created: `feature/enterprise-ai-sales`
- Base commit: `07220ed82c6ce081f572d6baea97f007c71bc13a` ("Allow running without Redis queues", branch `codex/railway-deploy`)
- Working tree at branch time: clean (only `.claude/settings.json` modified locally — tool settings, not project code; left untouched)
- No stashes, no staged changes, no user work discarded.

## Repository shape

- Turborepo + pnpm@9 monorepo, Node >= 20
- `apps/api` — NestJS backend
- `apps/web` — Next.js 14 frontend (Tailwind, RTL Arabic)
- `apps/worker` — background worker
- `apps/realtime` — realtime service
- `packages/` — ai, config, database, permissions, queue, shared, validation
- `prisma/schema.prisma` — single schema, migrations: `20260809000000_init`, `20260810000000_ai_support_learning`
- Prisma 5.22.0, Next 14.2.x

## Phase 1 — Baseline command results

(recorded below as they are executed; each classified BASELINE_PASS or PRE_EXISTING_FAILURE)

| Command | Exit code | Result | Classification |
|---|---|---|---|
| `pnpm typecheck` (turbo) | 1 | turbo binary crashes on this Windows machine (exit 3221225781 = missing DLL). Not related to code. | PRE_EXISTING_FAILURE (tooling) — workaround: run per-package scripts via `pnpm --filter` |
| `pnpm --filter @qanoai/{shared,config,database,validation,permissions,queue,ai} build` | 0 | all shared packages compile | BASELINE_PASS |
| `pnpm --filter @qanoai/api typecheck` | 0 | clean | BASELINE_PASS |
| `pnpm --filter @qanoai/web typecheck` | 0 | clean | BASELINE_PASS |
| `pnpm --filter @qanoai/worker build` | 0 | clean | BASELINE_PASS |
| `pnpm --filter @qanoai/api test` | 1 | **zero test files exist** (`testRegex .*\.spec\.ts$` → 0 matches in 126 files). Exit 1 is "No tests found", not failing tests. | PRE_EXISTING_FAILURE — repo has no automated tests at all; new module introduces the first real test suite |

Note: migrations are hand-written additive SQL files under `prisma/migrations/<timestamp>_<name>/migration.sql` (no shadow-db generation). New module must follow the same additive pattern.

Additional environmental tooling limits on this Windows machine (not code defects):
- `turbo` binary crashes (missing DLL) — use `pnpm --filter` per package.
- `next build` for `@qanoai/web` compiles and type-checks cleanly ("✓ Compiled successfully") but fails at the very end on `EPERM: symlink` while writing the `output: 'standalone'` directory (Windows symlink permission). Verified via `tsc --noEmit` (exit 0) which is the authoritative type gate. On Railway/Linux the standalone copy succeeds.
