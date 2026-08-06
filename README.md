# QanoAI WhatsAppSupport

منصة ذكاء اصطناعي متكاملة لدعم العملاء عبر واتساب

## 🚀 المميزات

- **ربط واتساب بالـ QR** — امسح QR code واربط رقمك في دقائق
- **ذكاء اصطناعي ذكي** — يجيب تلقائياً باستخدام قاعدة معرفتك
- **صندوق وارد موحد** — فريق كامل يدير المحادثات
- **تحليلات متقدمة** — تتبع الأداء ورضا العملاء
- **دعم RTL عربي** — واجهة عربية احترافية

## 🛠️ المتطلبات

- Docker Desktop
- Node.js 20+
- pnpm 9+

## 🌍 نشر الإنتاج (Production Deployment)

لدينا خطة جاهزة للنشر على **Vercel** (للواجهة الأمامية) و **Railway** (للخلفية):
- **Frontend URL:** https://your-project.vercel.app
- **API URL:** https://your-api.up.railway.app
- يرجى قراءة دليل النشر التفصيلي في ملف [DEPLOYMENT.md](DEPLOYMENT.md) وقائمة التحقق من جاهزية الإنتاج في [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

## ⚡ البدء السريع

```bash
# 1. نسخ المشروع
cd qanoai-whatsappsupport

# 2. تثبيت الاعتماديات
pnpm install

# 3. إعداد البيئة
cp .env.example .env
# عدل .env وأضف OPENAI_API_KEY و AUTH_SECRET

# 4. تشغيل البنية التحتية
pnpm docker:up

# 5. إعداد قاعدة البيانات
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 6. تشغيل التطبيق
pnpm dev
```

## 📁 هيكل المشروع

```
qanoai-whatsappsupport/
├── apps/
│   ├── api/           # NestJS Backend API
│   ├── web/           # Next.js Frontend
│   ├── worker/        # BullMQ Background Workers
│   └── realtime/      # Socket.IO Real-time Server
├── packages/
│   ├── database/      # Prisma ORM
│   ├── config/        # Environment Configuration
│   ├── shared/        # Constants & Utilities
│   ├── validation/    # Zod Schemas
│   ├── permissions/   # RBAC System
│   └── queue/         # BullMQ Infrastructure
├── prisma/
│   └── schema.prisma  # 60+ Database Models
└── infrastructure/
    └── docker/        # Dockerfiles
```

## 🔑 بيانات تجريبية

| الدور | البريد | كلمة المرور |
|-------|--------|-------------|
| المالك | owner@demo.qanoai | DemoPass123! |
| مدير الدعم | manager@demo.qanoai | DemoPass123! |
| موظف الدعم | agent@demo.qanoai | DemoPass123! |

## 🌐 الوصول

| الخدمة | الرابط |
|--------|--------|
| الواجهة الأمامية | http://localhost:3000 |
| API | http://localhost:3001 |
| Swagger Docs | http://localhost:3001/api/docs |
| Realtime | http://localhost:3002 |

## 📝 الأوامر

```bash
pnpm dev          # تشغيل التطوير
pnpm build        # بناء الإنتاج
pnpm docker:up    # تشغيل Docker
pnpm docker:down  # إيقاف Docker
pnpm db:migrate   # هجرة قاعدة البيانات
pnpm db:seed      # إضافة بيانات تجريبية
pnpm test         # تشغيل الاختبارات
```

## ⚠️ محدوديات معروفة

- QR connector يعتمد على Evolution API (ليس API رسمي من Meta)
- يحتاج إعادة ربط دورية
- بعض صفحات Dashboard قيد التطوير
- Billing gateway غير مربوط بعد (behind feature flag)

## 🔒 الأمان

- Tenant isolation عبر organizationId
- RBAC مع 30+ صلاحية
- JWT authentication
- Webhook idempotency
- Soft deletes + Audit logs

## 📄 الترخيص

Proprietary - QanoAI
