import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * Idempotent server-side bootstrap for the AI Sales & Marketing module.
 *
 * Grants the platform owner (PLATFORM_OWNER_EMAIL env var) the
 * PLATFORM_SUPER_ADMIN role in their organizations and enables the
 * marketing feature entitlements for those organizations.
 *
 * Safe to run repeatedly: every write is an upsert/conditional and every
 * actual change is recorded in the audit log. Exits 0 without changes when
 * the owner user does not exist yet (run again after registration).
 */

const prisma = new PrismaClient();

const MARKETING_CAPABILITIES = [
  "AI_SALES_MODULE",
  "PRODUCT_CATALOG",
  "LEAD_DISCOVERY",
  "LEAD_IMPORT",
  "MARKETING_CAMPAIGNS",
  "AI_PERSONALIZATION",
  "AI_SALES_AGENT",
  "DO_NOT_CONTACT",
  "SALES_ANALYTICS",
  "SALES_SETTINGS",
];

async function main() {
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    console.error("PLATFORM_OWNER_EMAIL is not set; nothing to bootstrap.");
    process.exit(1);
  }

  const correlationId = randomUUID();
  const changes: string[] = [];

  const user = await prisma.user.findUnique({
    where: { email: ownerEmail },
    include: { memberships: true },
  });
  if (!user) {
    console.log(`Owner user ${ownerEmail} not registered yet. No changes made; rerun after registration.`);
    return;
  }

  // 0. Ensure marketing permission definitions exist (without running the full demo seed).
  const marketingPermissions = [
    { code: "marketing.read", name: "قراءة التسويق", category: "marketing" },
    { code: "marketing.products.manage", name: "إدارة البرامج", category: "marketing" },
    { code: "marketing.leads.manage", name: "إدارة العملاء المحتملين", category: "marketing" },
    { code: "marketing.campaigns.manage", name: "إدارة الحملات", category: "marketing" },
    { code: "marketing.campaigns.start", name: "تشغيل الحملات", category: "marketing" },
    { code: "marketing.dnc.manage", name: "إدارة قائمة عدم التواصل", category: "marketing" },
    { code: "marketing.settings.manage", name: "إدارة إعدادات التسويق", category: "marketing" },
    { code: "marketing.analytics.read", name: "قراءة تحليلات التسويق", category: "marketing" },
  ];
  for (const perm of marketingPermissions) {
    const existing = await prisma.permission.findUnique({ where: { code: perm.code } });
    if (!existing) {
      await prisma.permission.create({ data: perm });
      changes.push(`created permission ${perm.code}`);
    }
  }

  // Grant marketing permissions to ORGANIZATION_OWNER (it is meant to hold all permissions).
  const ownerRole = await prisma.role.findFirst({ where: { name: "ORGANIZATION_OWNER", organizationId: null } });
  if (ownerRole) {
    const marketingPermRows = await prisma.permission.findMany({
      where: { code: { in: marketingPermissions.map((p) => p.code) } },
      select: { id: true },
    });
    const before = await prisma.rolePermission.count({ where: { roleId: ownerRole.id, permissionId: { in: marketingPermRows.map((p) => p.id) } } });
    if (before < marketingPermRows.length) {
      await prisma.rolePermission.createMany({
        data: marketingPermRows.map((p) => ({ roleId: ownerRole.id, permissionId: p.id })),
        skipDuplicates: true,
      });
      changes.push(`granted marketing permissions to ORGANIZATION_OWNER`);
    }
  }

  // 1. Ensure PLATFORM_SUPER_ADMIN system role exists and holds every permission.
  let superRole = await prisma.role.findFirst({ where: { name: "PLATFORM_SUPER_ADMIN", organizationId: null } });
  if (!superRole) {
    superRole = await prisma.role.create({ data: { name: "PLATFORM_SUPER_ADMIN", isSystem: true } });
    changes.push("created PLATFORM_SUPER_ADMIN role");
  }
  const allPerms = await prisma.permission.findMany({ select: { id: true } });
  const existingGrants = await prisma.rolePermission.findMany({
    where: { roleId: superRole.id },
    select: { permissionId: true },
  });
  const granted = new Set(existingGrants.map((g) => g.permissionId));
  const missing = allPerms.filter((p) => !granted.has(p.id));
  if (missing.length > 0) {
    await prisma.rolePermission.createMany({
      data: missing.map((p) => ({ roleId: superRole!.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    changes.push(`granted ${missing.length} permissions to PLATFORM_SUPER_ADMIN`);
  }

  // 2. Ensure the owner's memberships use the PLATFORM_SUPER_ADMIN role.
  const activeMemberships = user.memberships.filter((m) => m.status === "ACTIVE");
  if (activeMemberships.length === 0) {
    console.log(`Owner ${ownerEmail} has no ACTIVE organization membership. Entitlements need an organization; rerun after the owner joins or creates one.`);
  }
  for (const membership of activeMemberships) {
    if (membership.roleId !== superRole.id) {
      await prisma.membership.update({ where: { id: membership.id }, data: { roleId: superRole.id } });
      changes.push(`membership ${membership.id} (org ${membership.organizationId}) role -> PLATFORM_SUPER_ADMIN`);
    }
  }

  // 3. Enable marketing entitlements for each of the owner's organizations.
  for (const membership of activeMemberships) {
    for (const featureKey of MARKETING_CAPABILITIES) {
      const existing = await prisma.entitlement.findUnique({
        where: { organizationId_featureKey: { organizationId: membership.organizationId, featureKey } },
      });
      if (!existing) {
        await prisma.entitlement.create({
          data: { organizationId: membership.organizationId, featureKey, isEnabled: true },
        });
        changes.push(`entitlement ${featureKey} enabled for org ${membership.organizationId}`);
      } else if (!existing.isEnabled) {
        await prisma.entitlement.update({ where: { id: existing.id }, data: { isEnabled: true } });
        changes.push(`entitlement ${featureKey} re-enabled for org ${membership.organizationId}`);
      }
    }
  }

  // 4. Audit anything that actually changed.
  if (changes.length > 0) {
    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "MARKETING_MODULE_BOOTSTRAP",
        resourceType: "Entitlement",
        metadata: { ownerEmail, changes },
        correlationId,
      },
    });
    console.log("Bootstrap applied changes:");
    for (const c of changes) console.log(`  - ${c}`);
  } else {
    console.log("Bootstrap: everything already in place, no changes.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
