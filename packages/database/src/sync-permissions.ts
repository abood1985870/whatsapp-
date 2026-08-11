import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@qanoai/permissions";

/**
 * Reconcile the permission catalogue and the system roles with the code.
 *
 * `packages/permissions` is the single source of truth. It always was in
 * spirit — `@RequirePermission("members.update")` and friends are written
 * against it — but the database was populated from a hand-maintained list in
 * `seed.ts` that had drifted. Fourteen codes the API actively checks were never
 * inserted, so `PermissionGuard` denied every request for them and the
 * settings, teams, branches, routing, working-hours and SLA screens were dead
 * for everybody, including the owner. Three system roles had no grants at all.
 *
 * This runs at deploy time and is idempotent: it inserts what is missing,
 * updates names in place, grants what the map says a role should have, and
 * revokes grants the map no longer contains. It deliberately touches ONLY
 * system roles (`organizationId: null`, `isSystem: true`) — a role a customer
 * created for their own team is never modified.
 *
 * It removes no permission rows. A code that disappears from the map stops
 * being granted, but the row stays, because a `Permission` delete cascades to
 * grants on custom roles we do not own.
 */

/** Arabic display names. The UI lists these; a code with no entry falls back to its code. */
const NAMES: Record<string, string> = {
  "organization.read": "قراءة المؤسسة",
  "organization.update": "تحديث المؤسسة",
  "organization.billing.manage": "إدارة الاشتراك والفوترة",
  "members.read": "قراءة الأعضاء",
  "members.invite": "دعوة أعضاء",
  "members.update": "تعديل الأعضاء",
  "members.remove": "إزالة الأعضاء",
  "roles.read": "قراءة الأدوار",
  "roles.manage": "إدارة الأدوار",
  "whatsapp.read": "قراءة واتساب",
  "whatsapp.connect": "ربط واتساب",
  "whatsapp.disconnect": "فصل واتساب",
  "whatsapp.delete": "حذف اتصال واتساب",
  "contacts.read": "قراءة جهات الاتصال",
  "contacts.create": "إنشاء جهات اتصال",
  "contacts.update": "تحديث جهات الاتصال",
  "contacts.delete": "حذف جهات الاتصال",
  "conversations.read": "قراءة المحادثات",
  "conversations.reply": "الرد على المحادثات",
  "conversations.assign": "تخصيص المحادثات",
  "conversations.close": "إغلاق المحادثات",
  "conversations.delete": "حذف المحادثات",
  "conversations.export": "تصدير المحادثات",
  "ai.read": "قراءة الموظف الذكي",
  "ai.configure": "إعداد الموظف الذكي",
  "ai.publish": "نشر الموظف الذكي",
  "ai.toggle": "تشغيل وإيقاف الرد الآلي",
  "knowledge.read": "قراءة قاعدة المعرفة",
  "knowledge.upload": "رفع محتوى للمعرفة",
  "knowledge.update": "تحديث المعرفة",
  "knowledge.delete": "حذف المعرفة",
  "training.read": "قراءة التدريب",
  "training.manage": "إدارة التدريب",
  "analytics.read": "قراءة التحليلات",
  "analytics.export": "تصدير التحليلات",
  "integrations.read": "قراءة التكاملات",
  "integrations.manage": "إدارة التكاملات",
  "audit.read": "قراءة سجل التدقيق",
  "settings.manage": "إدارة الإعدادات",
  "marketing.read": "قراءة التسويق",
  "marketing.products.manage": "إدارة البرامج",
  "marketing.leads.manage": "إدارة العملاء المحتملين",
  "marketing.campaigns.manage": "إدارة الحملات",
  "marketing.campaigns.start": "تشغيل الحملات",
  "marketing.dnc.manage": "إدارة قائمة عدم التواصل",
  "marketing.settings.manage": "إدارة إعدادات التسويق",
  "marketing.analytics.read": "قراءة تحليلات التسويق",
  "voice.read": "قراءة الموظف الصوتي",
  "voice.agent.manage": "إدارة الموظف الصوتي",
  "voice.numbers.manage": "إدارة الأرقام",
  "voice.settings.manage": "إدارة إعدادات المكالمات",
  "voice.calls.read": "قراءة المكالمات",
  "voice.recordings.access": "الوصول لتسجيلات المكالمات",
  "voice.analytics.read": "قراءة تحليلات المكالمات",
  "voice.diagnostics.run": "تشغيل التشخيص",
};

/** Legacy codes that live in the database from the old seed list. */
const LEGACY_CODES = new Set([
  "whatsapp.update",
  "conversations.update",
  "message.send",
  "message.read",
  "message.broadcast",
]);

export interface SyncResult {
  permissionsInserted: number;
  permissionsUpdated: number;
  rolesCreated: number;
  grantsAdded: number;
  grantsRemoved: number;
  legacyCodesRetained: string[];
}

export async function syncPermissions(prisma: PrismaClient): Promise<SyncResult> {
  const result: SyncResult = {
    permissionsInserted: 0,
    permissionsUpdated: 0,
    rolesCreated: 0,
    grantsAdded: 0,
    grantsRemoved: 0,
    legacyCodesRetained: [],
  };

  const codes = Object.values(PERMISSIONS) as string[];

  // 1. The catalogue.
  for (const code of codes) {
    const category = code.split(".")[0];
    const name = NAMES[code] ?? code;
    const existing = await prisma.permission.findUnique({ where: { code }, select: { id: true, name: true } });
    if (!existing) {
      await prisma.permission.create({ data: { code, name, category } });
      result.permissionsInserted += 1;
    } else if (existing.name !== name) {
      await prisma.permission.update({ where: { code }, data: { name, category } });
      result.permissionsUpdated += 1;
    }
  }

  const allPermissions = await prisma.permission.findMany({ select: { id: true, code: true } });
  const idByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  result.legacyCodesRetained = allPermissions
    .map((p) => p.code)
    .filter((c) => !codes.includes(c) && LEGACY_CODES.has(c));

  // 2. System roles and their grants.
  for (const [roleName, grantedCodes] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await prisma.role.findFirst({
      where: { name: roleName, organizationId: null },
      select: { id: true, isSystem: true },
    });

    if (!role) {
      const created = await prisma.role.create({
        data: { name: roleName, isSystem: true, organizationId: null },
        select: { id: true, isSystem: true },
      });
      role = created;
      result.rolesCreated += 1;
    } else if (!role.isSystem) {
      // A global role by this name that is not marked system would otherwise be
      // silently granted platform-level permissions below.
      await prisma.role.update({ where: { id: role.id }, data: { isSystem: true } });
    }

    const wanted = new Set(
      (grantedCodes as string[]).map((c) => idByCode.get(c)).filter((id): id is string => Boolean(id))
    );

    const current = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const held = new Set(current.map((r) => r.permissionId));

    const toAdd = [...wanted].filter((id) => !held.has(id));
    if (toAdd.length) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role!.id, permissionId })),
        skipDuplicates: true,
      });
      result.grantsAdded += toAdd.length;
    }

    // Revoke anything the map no longer grants — except legacy codes, which
    // some running code may still check until they are retired deliberately.
    const legacyIds = new Set(
      allPermissions.filter((p) => LEGACY_CODES.has(p.code)).map((p) => p.id)
    );
    const toRemove = [...held].filter((id) => !wanted.has(id) && !legacyIds.has(id));
    if (toRemove.length) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove } },
      });
      result.grantsRemoved += toRemove.length;
    }
  }

  return result;
}
