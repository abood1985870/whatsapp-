import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Same reason as apply-2fa-column.ts / apply-outbound-safety.ts: the deployed
// database is reachable only through the pooler, and `prisma migrate` needs a
// direct connection. These three migrations were committed on the feature
// branch but never applied to the production database. Each is pure additive
// DDL (new tables, or nullable/defaulted columns on existing tables), so it is
// safe to run once, guarded by a table/column existence check for idempotency.
if (!process.env.DATABASE_URL) {
  const rootEnv = path.resolve(__dirname, "../../../.env");
  if (fs.existsSync(rootEnv)) {
    for (const line of fs.readFileSync(rootEnv, "utf-8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const MIGRATIONS: { dir: string; alreadyAppliedCheck: (prisma: PrismaClient) => Promise<boolean> }[] = [
  {
    dir: "20260810000000_ai_support_learning",
    alreadyAppliedCheck: async (prisma) => {
      const rows: any = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='ai_agents' AND column_name='supportPhoneNumber'`
      );
      return rows[0].n === 1;
    },
  },
  {
    dir: "20260811000000_ai_sales_marketing",
    alreadyAppliedCheck: async (prisma) => {
      const rows: any = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.sales_products')::text AS reg`);
      return rows[0].reg !== null;
    },
  },
  {
    dir: "20260811010000_ai_voice_employee",
    alreadyAppliedCheck: async (prisma) => {
      const rows: any = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.voice_agents')::text AS reg`);
      return rows[0].reg !== null;
    },
  },
];

async function applyMigration(prisma: PrismaClient, dir: string) {
  const sqlPath = path.resolve(__dirname, `../../../prisma/migrations/${dir}/migration.sql`);
  const sql = fs.readFileSync(sqlPath, "utf-8");
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const statement of withoutComments.split(";").map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const m of MIGRATIONS) {
      const done = await m.alreadyAppliedCheck(prisma);
      if (done) {
        console.log(`SKIP  ${m.dir} (already applied)`);
        continue;
      }
      console.log(`APPLY ${m.dir} ...`);
      await applyMigration(prisma, m.dir);
      console.log(`OK    ${m.dir}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
