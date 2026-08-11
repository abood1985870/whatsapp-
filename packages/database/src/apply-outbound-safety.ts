import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Same reason as apply-2fa-column.ts: the deployed database is reachable only
// through the pooler, and `prisma migrate` needs a direct connection.
if (!process.env.DATABASE_URL) {
  const rootEnv = path.resolve(__dirname, "../../../.env");
  if (fs.existsSync(rootEnv)) {
    for (const line of fs.readFileSync(rootEnv, "utf-8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  const sqlPath = path.resolve(__dirname, "../../../prisma/migrations/20260811030000_outbound_safety/migration.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");
  try {
    // Strip `--` comment lines BEFORE splitting on `;`. A semicolon inside a
    // comment would otherwise cut a statement in half and send the rest of the
    // English sentence to Postgres as SQL.
    const withoutComments = sql
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    for (const statement of withoutComments.split(";").map((s) => s.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
    const cols: any = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='marketing_settings' AND column_name IN
       ('dailyOutboundCap','perContactMinIntervalHours','quietHoursStart','quietHoursEnd','quietHoursEnabled')
       ORDER BY column_name`
    );
    const msg: any = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name='messages' AND column_name='isMarketing'`
    );
    const backfilled: any = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "messages" WHERE "isMarketing" = true`
    );
    console.log("settings columns :", cols.map((c: any) => c.column_name).join(", "));
    console.log("messages.isMarketing present:", msg[0].n === 1);
    console.log("marketing messages marked   :", backfilled[0].n);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
