import { PrismaClient } from "@prisma/client";

/**
 * Idempotent seed for the three launch plans. Starting prices only — every
 * value here is owner-editable afterward through Plans Management, so this
 * script never runs again once the rows exist (upsert by unique Plan.name is
 * a no-op on a second run).
 */
const prisma = new PrismaClient();

const MESSAGES_KEY = "whatsapp.messages.included";
const USERS_KEY = "users.included";

const PLANS = [
  {
    name: "الأفراد",
    tagline: "للأعمال الصغيرة والمستخدم الفردي",
    badge: null,
    sortOrder: 1,
    priceAmount: 149_00, // halalas
    messagesIncluded: 1000,
    usersIncluded: 1,
    features: ["مساعد واتساب بالذكاء الاصطناعي", "لوحة تحكم", "قاعدة معرفة", "إحصائيات أساسية", "دعم أساسي"],
  },
  {
    name: "الأعمال",
    tagline: "للمنشآت الصغيرة والمتوسطة",
    badge: "الأكثر طلباً",
    sortOrder: 2,
    priceAmount: 399_00,
    messagesIncluded: 5000,
    usersIncluded: 5,
    features: [
      "كل مميزات باقة الأفراد",
      "قاعدة معرفة أكبر",
      "إحصائيات متقدمة",
      "أكثر من مستخدم",
      "أولوية في الدعم",
      "خصائص AI متقدمة",
    ],
  },
  {
    name: "الشركات",
    tagline: "للشركات ذات حجم الرسائل المرتفع",
    badge: null,
    sortOrder: 3,
    priceAmount: 999_00,
    messagesIncluded: 20000,
    usersIncluded: 20,
    features: ["كل المميزات", "تقارير متقدمة", "دعم ذو أولوية", "إمكانيات تخصيص أعلى"],
  },
];

async function main() {
  for (const p of PLANS) {
    const plan = await prisma.plan.upsert({
      where: { name: p.name },
      create: { name: p.name, tagline: p.tagline, badge: p.badge, sortOrder: p.sortOrder, isActive: true, isPublic: true },
      update: {},
    });

    const existingPrice = await prisma.planPrice.findFirst({ where: { planId: plan.id, interval: "MONTH" } });
    if (!existingPrice) {
      await prisma.planPrice.create({ data: { planId: plan.id, amount: p.priceAmount, interval: "MONTH", currency: "SAR" } });
    }

    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: plan.id, featureKey: MESSAGES_KEY } },
      create: { planId: plan.id, featureKey: MESSAGES_KEY, limit: p.messagesIncluded },
      update: {},
    });
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: plan.id, featureKey: USERS_KEY } },
      create: { planId: plan.id, featureKey: USERS_KEY, limit: p.usersIncluded },
      update: {},
    });
    for (const label of p.features) {
      await prisma.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey: label } },
        create: { planId: plan.id, featureKey: label, isEnabled: true },
        update: {},
      });
    }
    console.log(`OK ${p.name}`);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
