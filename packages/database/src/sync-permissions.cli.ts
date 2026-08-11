import { PrismaClient } from "@prisma/client";
import { syncPermissions } from "./sync-permissions";

/**
 * Deploy-time entry point. Safe to run on every deploy and safe to run twice.
 * It creates no organizations, no users and no demo data — unlike the seed,
 * which is for a fresh development database only.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await syncPermissions(prisma);
    console.log("Permission sync complete:");
    console.log(`  permissions inserted : ${result.permissionsInserted}`);
    console.log(`  permissions updated  : ${result.permissionsUpdated}`);
    console.log(`  system roles created : ${result.rolesCreated}`);
    console.log(`  grants added         : ${result.grantsAdded}`);
    console.log(`  grants revoked       : ${result.grantsRemoved}`);
    if (result.legacyCodesRetained.length) {
      console.log(`  legacy codes kept    : ${result.legacyCodesRetained.join(", ")}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Permission sync failed:", error);
  process.exit(1);
});
