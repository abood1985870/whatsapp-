# QanoAI WhatsAppSupport Progress

## 2026-08-09

### المرحلة صفر: تدقيق الحالة الحالية

الحالة: مكتملة.

ما تم:

- فحص شجرة المشروع في `apps/*`, `packages/*`, `prisma/*`, `infrastructure/*`, وملفات التوثيق.
- حصر تطبيقات monorepo والحزم المشتركة.
- حصر وحدات API والـ controllers والـ endpoints الموجودة.
- حصر صفحات Next.js الموجودة.
- حصر BullMQ processors الموجودة.
- استخراج نماذج Prisma ومقارنتها بالاستخدام المباشر في الكود.
- البحث عن `TODO`, `mock`, `not implemented`, placeholders، والمنطق الوهمي.
- محاولة تشغيل `pnpm typecheck` و`pnpm test`.
- إنشاء `AUDIT.md` بنتائج التدقيق والفجوات والأولويات.

نتائج مهمة:

- النظام جزئي ومبني بشكل واسع، لكنه غير production-ready بعد.
- أخطر فجوة حالية هي عزل المستأجرين واعتماد عدة endpoints على `organizationId` من input المستخدم.
- عند بداية التدقيق لم تكن توجد Prisma migrations فعلية داخل `prisma/`؛ تمت إضافة migration مبدئية لاحقًا.
- التخزين الحقيقي للملفات والوسائط غير مكتمل.
- الفوترة والويب هوكس الخارجية وCSAT وتصدير/حذف البيانات موجودة في schema غالبًا، لكنها غير منفذة كواجهات كاملة.
- الاختبارات غير كافية، وفحص `pnpm typecheck` فشل برمز Windows `3221225781`.

المرحلة التالية المقترحة:

- المرحلة 1 تبدأ بإصلاح الأساسيات ذات المخاطر الأعلى: tenancy isolation، migrations، readiness، وإزالة mocks الحرجة من مسار الملفات/الوسائط.

### المرحلة 1: إصلاحات تأسيسية أولى

الحالة: بدأت.

ما تم:

- إضافة `CORS_ORIGINS` إلى إعدادات البيئة واستخدامه في API وrealtime.
- جعل readiness في API يفحص PostgreSQL وRedis معًا.
- تحسين مصادقة realtime لتستخرج المستخدم والعضوية النشطة من قاعدة البيانات بدل توقع claims غير موجودة في JWT.
- منع دخول socket إلى room محادثة لا تنتمي لمنظمة المستخدم.
- إضافة تحقق HMAC اختياري لويب هوك Evolution عبر `EVOLUTION_WEBHOOK_SECRET`.
- مطابقة payloads الخاصة بـ Evolution API docs لمساري `setWebhook` و`sendMedia`.
- إضافة migration مبدئية في `prisma/migrations/20260809000000_init/migration.sql` مع تفعيل `pgvector`.
- إضافة متغيرات Supabase إلى config و`.env.example`، وإعداد القيم الحقيقية في `.env` المحلي.
- تحديث `DATABASE_URL` المحلي لاستخدام اتصال PostgreSQL من Supabase مع percent-encoding للرموز الخاصة وSSL.
- تجهيز `start.sh`, `gateway.js`, و`nixpacks.toml` ليستخدم Railway متغيرات `DATABASE_URL` و`REDIS_URL` بدل تشغيل Postgres/Redis داخل الحاوية.
- إنشاء `DECISIONS.md` لتوثيق القرارات الهندسية.
- إنشاء `SETUP.md` لتوثيق متغيرات البيئة وخطوات التشغيل.

التحقق:

- `pnpm --filter @qanoai/config typecheck` نجح.
- `pnpm --filter @qanoai/config build` نجح.
- `pnpm --filter @qanoai/api typecheck` نجح بعد تحديث `@qanoai/config/dist`.
- `pnpm --filter @qanoai/realtime exec tsc --noEmit` نجح.
- `pnpm exec prisma validate --schema prisma/schema.prisma` نجح.
- `pnpm typecheck` العام ما زال يفشل عند `turbo run typecheck` برمز Windows `3221225781` بدون تفاصيل TypeScript.

المتبقي في المرحلة 1:

- تشديد tenant isolation في API services/controllers.
- تنفيذ S3-compatible storage الحقيقي بدل mocks.
- تجربة تطبيق migration على قاعدة PostgreSQL فارغة عبر `prisma migrate dev`.
- إضافة اختبارات tenant isolation وhealth/realtime/webhook.
