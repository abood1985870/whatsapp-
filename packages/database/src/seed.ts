import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Create permissions
  const permissions = [
    { code: "organization.read", name: "قراءة المؤسسة", category: "organization" },
    { code: "organization.update", name: "تحديث المؤسسة", category: "organization" },
    { code: "members.read", name: "قراءة الأعضاء", category: "members" },
    { code: "members.invite", name: "دعوة أعضاء", category: "members" },
    { code: "whatsapp.read", name: "قراءة واتساب", category: "whatsapp" },
    { code: "whatsapp.connect", name: "ربط واتساب", category: "whatsapp" },
    { code: "whatsapp.disconnect", name: "فصل واتساب", category: "whatsapp" },
    { code: "whatsapp.update", name: "تحديث واتساب", category: "whatsapp" },
    { code: "conversations.read", name: "قراءة المحادثات", category: "conversations" },
    { code: "conversations.reply", name: "الرد على المحادثات", category: "conversations" },
    { code: "conversations.assign", name: "تخصيص المحادثات", category: "conversations" },
    { code: "conversations.close", name: "إغلاق المحادثات", category: "conversations" },
    { code: "conversations.update", name: "تحديث المحادثات", category: "conversations" },
    { code: "contacts.read", name: "قراءة جهات الاتصال", category: "contacts" },
    { code: "contacts.create", name: "إنشاء جهات اتصال", category: "contacts" },
    { code: "contacts.update", name: "تحديث جهات الاتصال", category: "contacts" },
    { code: "ai.read", name: "قراءة AI", category: "ai" },
    { code: "ai.configure", name: "إعداد AI", category: "ai" },
    { code: "ai.publish", name: "نشر AI", category: "ai" },
    { code: "knowledge.read", name: "قراءة المعرفة", category: "knowledge" },
    { code: "knowledge.upload", name: "رفع المعرفة", category: "knowledge" },
    { code: "knowledge.delete", name: "حذف المعرفة", category: "knowledge" },
    { code: "analytics.read", name: "قراءة التحليلات", category: "analytics" },
    { code: "settings.manage", name: "إدارة الإعدادات", category: "settings" },
    { code: "audit.read", name: "قراءة التدقيق", category: "audit" },
    { code: "message.send", name: "إرسال رسالة", category: "messages" },
    { code: "message.read", name: "قراءة رسالة", category: "messages" },
    { code: "message.broadcast", name: "بث الرسائل", category: "messages" },
    { code: "marketing.read", name: "قراءة التسويق", category: "marketing" },
    { code: "marketing.products.manage", name: "إدارة البرامج", category: "marketing" },
    { code: "marketing.leads.manage", name: "إدارة العملاء المحتملين", category: "marketing" },
    { code: "marketing.campaigns.manage", name: "إدارة الحملات", category: "marketing" },
    { code: "marketing.campaigns.start", name: "تشغيل الحملات", category: "marketing" },
    { code: "marketing.dnc.manage", name: "إدارة قائمة عدم التواصل", category: "marketing" },
    { code: "marketing.settings.manage", name: "إدارة إعدادات التسويق", category: "marketing" },
    { code: "marketing.analytics.read", name: "قراءة تحليلات التسويق", category: "marketing" },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({ where: { code: perm.code }, update: {}, create: perm });
  }
  console.log("✅ Permissions created");

  // Create roles
  const roles = [
    { name: "PLATFORM_SUPER_ADMIN", isSystem: true },
    { name: "ORGANIZATION_OWNER", isSystem: true },
    { name: "ORGANIZATION_ADMIN", isSystem: true },
    { name: "SUPPORT_MANAGER", isSystem: true },
    { name: "SUPPORT_AGENT", isSystem: true },
    { name: "ANALYST", isSystem: true },
    { name: "READ_ONLY", isSystem: true },
  ];

  const createdRoles: Record<string, string> = {};
  for (const role of roles) {
    let created = await prisma.role.findFirst({ where: { name: role.name, organizationId: null } });
    if (!created) {
      created = await prisma.role.create({ data: role });
    }
    createdRoles[role.name] = created.id;
  }
  console.log("✅ Roles created");

  // Assign ALL permissions to OWNER and PLATFORM_SUPER_ADMIN roles
  const allPerms = await prisma.permission.findMany();
  type SeedPermission = (typeof allPerms)[number];
  for (const roleName of ["ORGANIZATION_OWNER", "PLATFORM_SUPER_ADMIN"]) {
    for (const perm of allPerms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: createdRoles[roleName], permissionId: perm.id } },
        update: {},
        create: { roleId: createdRoles[roleName], permissionId: perm.id },
      });
    }
  }

  // Assign permissions to SUPPORT_MANAGER role
  const managerPermCodes = [
    "organization.read", "members.read", "whatsapp.read", "whatsapp.connect", "whatsapp.disconnect", "whatsapp.update",
    "conversations.read", "conversations.reply", "conversations.assign", "conversations.close", "conversations.update",
    "contacts.read", "contacts.create", "contacts.update",
    "ai.read", "ai.configure", "knowledge.read", "knowledge.upload",
    "analytics.read", "message.send", "message.read", "message.broadcast",
  ];
  const managerPerms = allPerms.filter((p: SeedPermission) => managerPermCodes.includes(p.code));
  for (const perm of managerPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: createdRoles["SUPPORT_MANAGER"], permissionId: perm.id } },
      update: {},
      create: { roleId: createdRoles["SUPPORT_MANAGER"], permissionId: perm.id },
    });
  }

  // Assign permissions to SUPPORT_AGENT role
  const agentPermCodes = [
    "conversations.read", "conversations.reply",
    "contacts.read", "ai.read", "knowledge.read",
    "message.send", "message.read",
  ];
  const agentPerms = allPerms.filter((p: SeedPermission) => agentPermCodes.includes(p.code));
  for (const perm of agentPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: createdRoles["SUPPORT_AGENT"], permissionId: perm.id } },
      update: {},
      create: { roleId: createdRoles["SUPPORT_AGENT"], permissionId: perm.id },
    });
  }

  console.log("✅ Role permissions assigned");

  // Create demo users
  const passwordHash = await bcrypt.hash("DemoPass123!", 12);

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.qanoai" },
    update: {},
    create: { name: "مدير التجريبي", email: "owner@demo.qanoai", passwordHash, emailVerifiedAt: new Date(), preferredLocale: "ar" },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@demo.qanoai" },
    update: {},
    create: { name: "مدير الدعم", email: "manager@demo.qanoai", passwordHash, emailVerifiedAt: new Date(), preferredLocale: "ar" },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@demo.qanoai" },
    update: {},
    create: { name: "موظف الدعم", email: "agent@demo.qanoai", passwordHash, emailVerifiedAt: new Date(), preferredLocale: "ar" },
  });

  console.log("✅ Demo users created");

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: "demo-qanoai" },
    update: {},
    create: {
      slug: "demo-qanoai",
      legalName: "شركة QanoAI التجريبية",
      displayName: "QanoAI Demo",
      industry: "تقنية",
      country: "SA",
      timezone: "Asia/Riyadh",
      locale: "ar",
      currency: "SAR",
      status: "ACTIVE",
    },
  });

  // Create memberships (idempotent - check first)
  const existingMemberships = await prisma.membership.findMany({ where: { organizationId: org.id } });
  if (existingMemberships.length === 0) {
    await prisma.membership.createMany({
      data: [
        { userId: owner.id, organizationId: org.id, roleId: createdRoles["ORGANIZATION_OWNER"], status: "ACTIVE", joinedAt: new Date() },
        { userId: manager.id, organizationId: org.id, roleId: createdRoles["SUPPORT_MANAGER"], status: "ACTIVE", joinedAt: new Date() },
        { userId: agent.id, organizationId: org.id, roleId: createdRoles["SUPPORT_AGENT"], status: "ACTIVE", joinedAt: new Date() },
      ],
    });
  }

  console.log("✅ Demo organization and memberships created");

  // Create demo contacts (idempotent)
  const existingContacts = await prisma.contact.count({ where: { organizationId: org.id } });
  let contacts: any[];
  if (existingContacts === 0) {
    contacts = await Promise.all([
      prisma.contact.create({ data: { organizationId: org.id, primaryPhone: "+966501234567", normalizedPhone: "966501234567", name: "أحمد محمد", language: "ar", source: "WHATSAPP" } }),
      prisma.contact.create({ data: { organizationId: org.id, primaryPhone: "+966507654321", normalizedPhone: "966507654321", name: "سارة عبدالله", language: "ar", source: "WHATSAPP" } }),
      prisma.contact.create({ data: { organizationId: org.id, primaryPhone: "+966501112222", normalizedPhone: "966501112222", name: "خالد العلي", language: "ar", source: "WHATSAPP" } }),
    ]);
  } else {
    contacts = await prisma.contact.findMany({ where: { organizationId: org.id }, take: 3 });
  }

  // Create demo channel connection (idempotent)
  let channelConnection = await prisma.channelConnection.findFirst({ where: { organizationId: org.id, name: "واتساب الدعم الرئيسي" } });
  if (!channelConnection) {
    channelConnection = await prisma.channelConnection.create({
      data: {
        organizationId: org.id,
        name: "واتساب الدعم الرئيسي",
        status: "CONNECTED",
        phoneNumber: "+966500000000",
        provider: "EVOLUTION",
      },
    });
  }

  // Create demo conversations (idempotent)
  const existingConvos = await prisma.conversation.count({ where: { organizationId: org.id } });
  if (existingConvos === 0 && contacts.length >= 3) {
    const conversations = await Promise.all([
      prisma.conversation.create({ data: { organizationId: org.id, channelConnectionId: channelConnection.id, contactId: contacts[0].id, status: "OPEN", mode: "AI_AUTOMATIC", priority: "MEDIUM" } }),
      prisma.conversation.create({ data: { organizationId: org.id, channelConnectionId: channelConnection.id, contactId: contacts[1].id, status: "WAITING_FOR_AGENT", mode: "HUMAN_ONLY", priority: "HIGH" } }),
      prisma.conversation.create({ data: { organizationId: org.id, channelConnectionId: channelConnection.id, contactId: contacts[2].id, status: "RESOLVED", mode: "AI_AUTOMATIC", priority: "LOW" } }),
    ]);

    // Create demo messages
    await prisma.message.createMany({
      data: [
        { organizationId: org.id, conversationId: conversations[0].id, channelConnectionId: channelConnection.id, contactId: contacts[0].id, direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", text: "السلام عليكم، وين أقدر أشوف منتجاتكم؟", providerStatus: "READ" },
        { organizationId: org.id, conversationId: conversations[0].id, channelConnectionId: channelConnection.id, direction: "OUTBOUND", senderType: "AI", messageType: "TEXT", text: "وعليكم السلام! تفضل بزيارة موقعنا qanoai.com/products", providerStatus: "DELIVERED", isAiGenerated: true },
        { organizationId: org.id, conversationId: conversations[0].id, channelConnectionId: channelConnection.id, contactId: contacts[0].id, direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", text: "شكراً لك!", providerStatus: "READ" },
        { organizationId: org.id, conversationId: conversations[1].id, channelConnectionId: channelConnection.id, contactId: contacts[1].id, direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", text: "عندي شكوى على الطلب رقم 12345", providerStatus: "READ" },
        { organizationId: org.id, conversationId: conversations[2].id, channelConnectionId: channelConnection.id, contactId: contacts[2].id, direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", text: "كم سعر الاشتراك الشهري؟", providerStatus: "READ" },
        { organizationId: org.id, conversationId: conversations[2].id, channelConnectionId: channelConnection.id, direction: "OUTBOUND", senderType: "AI", messageType: "TEXT", text: "الاشتراك الشهري يبدأ من 299 ريال. هل تبي تفاصيل أكثر؟", providerStatus: "READ", isAiGenerated: true },
      ],
    });
  }

  // Create demo AI agent (idempotent)
  const existingAgent = await prisma.aiAgent.findFirst({ where: { organizationId: org.id } });
  if (!existingAgent) {
    await prisma.aiAgent.create({
      data: {
        organizationId: org.id,
        name: "وكيل الدعم الرئيسي",
        description: "وكيل ذكاء اصطناعي للرد على استفسارات العملاء",
        status: "ACTIVE",
        defaultLanguage: "ar",
        tone: "PROFESSIONAL",
        greetingMessage: "أهلاً بك! كيف أقدر أساعدك اليوم؟",
        fallbackMessage: "عذراً، ما عندي الإجابة الحين. راح أحولك لموظف.",
        handoffMessage: "تم تحويل محادثتك لموظف. شكراً لصبرك.",
        confidenceThreshold: 0.7,
        autoReplyEnabled: true,
        createdById: owner.id,
      },
    });
  }

  // Create demo knowledge base (idempotent)
  const existingKb = await prisma.knowledgeBase.findFirst({ where: { organizationId: org.id } });
  if (!existingKb) {
    await prisma.knowledgeBase.create({ data: { organizationId: org.id, name: "قاعدة المعرفة الرئيسية", description: "معلومات الشركة والمنتجات", isDefault: true } });
  }

  // Create demo FAQ (idempotent)
  const existingFaq = await prisma.faqEntry.count({ where: { organizationId: org.id } });
  if (existingFaq === 0) {
    await prisma.faqEntry.createMany({
      data: [
        { organizationId: org.id, question: "كم سعر الاشتراك؟", answer: "الاشتراك يبدأ من 299 ريال شهرياً.", category: "الأسعار", language: "ar" },
        { organizationId: org.id, question: "كيف أربط واتساب؟", answer: "ادخل على إعدادات واتساب وامسح QR code.", category: "الربط", language: "ar" },
        { organizationId: org.id, question: "هل في نسخة تجريبية؟", answer: "نعم، 14 يوم تجربة مجانية.", category: "عام", language: "ar" },
      ],
    });
  }

  // Create demo plan (idempotent)
  const existingPlan = await prisma.plan.findFirst({ where: { name: "Basic" } });
  if (!existingPlan) {
    await prisma.plan.create({
      data: {
        name: "Basic",
        description: "الخطة الأساسية للشركات الصغيرة",
        isActive: true,
        features: {
          create: [
            { featureKey: "whatsapp_connections", limit: 1 },
            { featureKey: "members", limit: 3 },
            { featureKey: "ai_messages", limit: 1000 },
            { featureKey: "storage_mb", limit: 1000 },
          ],
        },
      },
    });
  }

  console.log("✅ Seed completed successfully!");
  console.log("");
  console.log("🔑 Demo Credentials:");
  console.log("  Owner:    owner@demo.qanoai / DemoPass123!");
  console.log("  Manager:  manager@demo.qanoai / DemoPass123!");
  console.log("  Agent:    agent@demo.qanoai / DemoPass123!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
