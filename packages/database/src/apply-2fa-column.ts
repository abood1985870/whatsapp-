import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Prisma resolves env("DATABASE_URL") from the process environment, and this
// script runs with its cwd inside packages/database where there is no .env.
// Read the monorepo root file explicitly rather than depending on where the
// script happens to be invoked from.
if (!process.env.DATABASE_URL) {
  const rootEnv = path.resolve(__dirname, "../../../.env");
  if (fs.existsSync(rootEnv)) {
    for (const line of fs.readFileSync(rootEnv, "utf-8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

/**
 * Adds TwoFactorCredential.confirmedAt.
 *
 * Written as a script rather than a Prisma migration because the deployed
 * database is only reachable through the connection pooler, and `prisma migrate`
 * needs a direct connection. Idempotent and additive: a nullable column plus a
 * backfill of the rows that were already in use under the old flow.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "two_factor_credentials" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3)`
    );
    const backfilled = await prisma.$executeRawUnsafe(
      `UPDATE "two_factor_credentials" c
       SET "confirmedAt" = c."createdAt"
       FROM "users" u
       WHERE c."userId" = u."id" AND u."twoFactorEnabled" = true AND c."confirmedAt" IS NULL`
    );
    const cols: any = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='two_factor_credentials' ORDER BY column_name`
    );
    const rows: any = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS total FROM "two_factor_credentials"`
    );
    console.log("columns        :", cols.map((c: any) => c.column_name).join(", "));
    console.log("rows backfilled:", backfilled);
    console.log("total 2FA rows :", rows[0].total);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
