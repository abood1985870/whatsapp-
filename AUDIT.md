# QanoAI WhatsAppSupport Audit

تاريخ التدقيق: 2026-08-09

## الخلاصة

النظام الحالي عبارة عن monorepo لمنصة SaaS لدعم العملاء عبر واتساب، مبنية من:

- `apps/web`: واجهة Next.js عربية RTL.
- `apps/api`: API مبني بـ NestJS.
- `apps/realtime`: Socket.IO مع Redis adapter.
- `apps/worker`: BullMQ workers.
- `packages/*`: حزم مشتركة للإعدادات، قاعدة البيانات، الطوابير، الذكاء الاصطناعي، الصلاحيات، التحقق، والأنواع.
- `prisma/schema.prisma`: مخطط PostgreSQL واسع يحتوي 67 نموذجًا تقريبًا.

المنتج ليس مكتملًا للإنتاج بعد. توجد أجزاء قوية ومنطق حقيقي في المصادقة، المحادثات، الرسائل، واتساب، AI/RAG، والـ realtime، لكن توجد فجوات إنتاجية وأمنية واضحة، خصوصًا في عزل المستأجرين، التخزين الحقيقي للملفات، الويب هوكس، الفوترة، الاختبارات، وحاجة migrations للتطبيق والاختبار على قاعدة فارغة.

## حالة التطبيقات

| المسار | الحالة | الملاحظات |
| --- | --- | --- |
| `apps/api` | جزئي | وحدات كثيرة موجودة وتستخدم Prisma فعليًا، لكن كثير من المسارات تعتمد على `organizationId` من `query/body` بدل السياق الموثق من JWT. |
| `apps/web` | جزئي | صفحات أساسية موجودة ومتصلة بـ API، لكن الواجهة ترسل `organizationId` صراحة في query/body، ولا تغطي كل وظائف المنتج المطلوبة. |
| `apps/realtime` | جزئي جيد | JWT middleware وrooms للمنظمات والمحادثات وRedis adapter موجودة، لكن `join-conversation` لا يتحقق من ملكية المحادثة في قاعدة البيانات. |
| `apps/worker` | جزئي | processors موجودة وبعضها ينفذ منطقًا حقيقيًا، لكن بعضها ما زال mock أو logging فقط. |
| `packages/config` | جيد | Zod env validation موجود ويفشل مبكرًا عند نقص المتغيرات الأساسية. |
| `packages/database` | جزئي | Prisma singleton موجود. أضيفت migration مبدئية بعد التدقيق، لكنها تحتاج اختبار تطبيق فعلي. |
| `packages/queue` | جيد جزئيًا | BullMQ queues وworkers وRedis emitter موجودة، مع retry/backoff، لكن dead-letter لا يخزن سجلًا دائمًا في DB. |
| `packages/shared` | جيد | ثوابت وأنواع مشتركة موجودة. |
| `packages/validation` | جزئي | يوجد Zod schemas للمدخلات الأساسية فقط، وليس لكل endpoint. |
| `packages/permissions` | جزئي جيد | RBAC permissions موجودة، لكن التطبيق العملي يحتاج ربطًا أقوى بعزل الموارد. |
| `packages/ai` | جزئي | RAG وOpenAI calls وsafety heuristics موجودة، لكن بعض طبقات السلامة والأدوات غير مكتملة إنتاجيًا. |

## وحدات API الموجودة

الوحدات الموجودة فعليًا في `apps/api/src`:

- `auth`: تسجيل، دخول، me، reset/verify password/email، refresh، logout، change profile/password، 2FA.
- `organizations`: منظمة، أعضاء، أدوار، فروع، فرق، routing rules، working hours، holidays، SLA policies.
- `whatsapp`: connections، QR، status، reconnect، webhook config، send message/template/broadcast، media.
- `webhooks`: استقبال Evolution webhook ومعالجة رسائل inbound وحالات الرسائل.
- `conversations`: قائمة، تفاصيل، تحديث، assign، resolve، close، snooze، reopen، block، tags، watch، notes، merge، bulk actions، export.
- `messages`: قائمة، بحث، إرسال، media، template، internal notes، retry، delete.
- `contacts`: قائمة، تفاصيل، إنشاء، تحديث، tags، custom fields، merge، timeline، import/export.
- `ai-agents`: CRUD، publish، test، versions، rollback، clone، runs، feedback، evaluation، policies، tools.
- `knowledge`: bases، sources، FAQ، sync، stats، documents، search، categories.
- `analytics`: dashboard، conversations، agents، team، export.
- `notifications`: list/read/read-all.
- `audit`: list/log service.
- `files`: upload/download/delete.
- `health`: health/ready.

## صفحات الواجهة الموجودة

الصفحات الموجودة فعليًا:

- `/`: landing page.
- `/login`: تسجيل دخول.
- `/register`: تسجيل.
- `/app`: layout داخلي.
- `/app/inbox`: صندوق المحادثات.
- `/app/inbox/[id]`: تفاصيل المحادثة.
- `/app/contacts`: جهات الاتصال.
- `/app/analytics`: التحليلات.
- `/app/ai-agents`: وكلاء الذكاء الاصطناعي.
- `/app/knowledge`: قاعدة المعرفة.
- `/app/whatsapp`: إعدادات واتساب.
- `/app/settings`: إعدادات عامة.

الفجوة الأهم في الواجهة: صفحات كثيرة تستخدم `organizationId` من عضوية المستخدم ثم تمرره للـ API عبر query/body. هذا يفتح باب IDOR إذا لم يعزل الـ API الموارد دائمًا من JWT/المصدر الموثوق.

## Workers الموجودة

المعالجات الموجودة:

- `whatsapp-outgoing.processor.ts`: يرسل رسائل واتساب عبر Evolution API ويحدث حالة الرسالة.
- `ai-response.processor.ts`: يستدعي `packages/ai`، ينشئ رسالة AI، ويسجل `AiRun`.
- `document-ingestion.processor.ts`: chunking + embeddings + تخزين `document_chunks` عبر pgvector.
- `conversation-summary.processor.ts`: يلخص المحادثات المغلقة.
- `usage-aggregation.processor.ts`: يجمع usage events يوميًا.
- `scheduled-reports.processor.ts`: جزئي، ينشئ `ReportRun` برابط mock.
- `cleanup.processor.ts`: تنظيف محدود.
- `dead-letter.processor.ts`: logging فقط بدون تخزين دائم أو تنبيه فعلي.

## قاعدة البيانات

`prisma/schema.prisma` يحتوي نماذج واسعة تغطي:

- الهوية والمصادقة: `User`, `Session`, `Account`, `Verification`, `TwoFactorCredential`.
- المنظمات والصلاحيات: `Organization`, `Membership`, `Invitation`, `Role`, `Permission`, `RolePermission`.
- فرق وتوجيه وساعات عمل وSLA: `Branch`, `Team`, `RoutingRule`, `WorkingHours`, `Holiday`, `SlaPolicy`.
- واتساب والويب هوكس: `ChannelConnection`, `WhatsAppInstance`, `ProviderCredential`, `ProviderHealthEvent`, `WebhookEvent`.
- العملاء والمحادثات والرسائل: `Contact`, `Tag`, `ContactTag`, `Conversation`, `Message`, `MediaAsset`, وغيرها.
- الذكاء والمعرفة: `AiAgent`, `AiRun`, `AiFeedback`, `KnowledgeBase`, `KnowledgeSource`, `Document`, `DocumentChunk`, وغيرها.
- الفوترة: `Plan`, `Subscription`, `UsageEvent`, `Invoice`, `Payment`, وغيرها.
- الامتثال والأمن: `AuditLog`, `FeatureFlag`, `DataExportRequest`, `DataDeletionRequest`, `SecurityEvent`, وغيرها.

ملاحظات مهمة:

- عند بداية التدقيق لم يكن يوجد مجلد migrations داخل `prisma/`. أضيفت لاحقًا migration مبدئية في `prisma/migrations/20260809000000_init/migration.sql`، لكنها لم تطبق بعد على قاعدة PostgreSQL فارغة.
- المخطط يستخدم `Unsupported("vector(1536)")` في `DocumentChunk.embedding`، وهذا مناسب لـ pgvector لكن يحتاج extension/migration واضحة.
- أسماء بعض النماذج تختلف عن البرومبت لكنها تغطي المعنى نفسه: `Membership` بدل `OrganizationMember`، و`Verification` بدل `PasswordReset`/email verification، و`ChannelConnection` بدل `WhatsAppChannel`.
- لا يوجد نموذج `RefreshToken` مستقل، و`refreshToken()` في الكود يصدر access token جديدًا بدون rotation أو تخزين token.
- لا يوجد نموذج `RateLimitLog`.

## نماذج Prisma غير مستخدمة مباشرة في الكود

النماذج التالية موجودة في Prisma ولم يظهر لها استخدام مباشر عبر `prisma.<model>` داخل `apps` أو `packages`:

`Session`, `Account`, `TeamMember`, `WhatsAppInstance`, `ProviderCredential`, `ProviderHealthEvent`, `Tag`, `ContactCustomFieldDefinition`, `ConversationMention`, `MessageStatusEvent`, `PromptVersion`, `AgentToolVersion`, `ToolApproval`, `DocumentChunk`, `KnowledgeTag`, `KnowledgeSnapshot`, `RetrievalLog`, `NotificationPreference`, `PlanPrice`, `PlanFeature`, `Subscription`, `SubscriptionItem`, `Entitlement`, `Invoice`, `InvoiceLine`, `Payment`, `Credit`, `Coupon`, `Integration`, `ApiKey`, `OutboundWebhookEndpoint`, `OutboundWebhookDelivery`, `FeatureFlag`, `CsatSurvey`, `CsatResponse`, `DataExportRequest`, `DataDeletionRequest`, `SecurityEvent`, `SupportAccessGrant`.

ملاحظة: `DocumentChunk` يستخدم عبر raw SQL في ingestion/RAG، لذلك هو مستخدم فعليًا لكن ليس عبر Prisma client model مباشر.

## فجوات أمنية ووظيفية حرجة

1. عزل المستأجرين غير صارم في عدة endpoints.
   الدليل: `OrganizationGuard` يقرأ `organizationId` من params/body/query، وكثير من controllers تمرر هذا الحقل للخدمات مباشرة. هذا يخالف شرط البرومبت بأن العزل يجب أن يأتي من JWT/المصدر الموثوق وليس من input المستخدم.

2. `PermissionGuard` لديه fallback لأول عضوية نشطة عند غياب `organizationId`.
   هذا قد يسمح بفحص صلاحية عام لا يثبت ملكية المورد المطلوب. الخدمات يجب أن تتحقق من `organizationId` عند قراءة/تحديث أي resource.

3. Webhook inbound لا يتحقق من HMAC.
   `EvolutionProvider.validateWebhook()` يطبع payload إلى event داخلي، لكنه لا يتحقق من توقيع وارد أو secret.

4. CORS في realtime مفتوح على `*`.
   `apps/realtime/src/main.ts` يسمح بأي origin، وهذا غير مناسب للإنتاج.

5. Health readiness لا يفحص Redis.
   `HealthService.ready()` يفحص قاعدة البيانات فقط، بينما البرومبت يطلب DB وRedis.

6. التخزين الحقيقي للملفات غير منفذ.
   `FilesService.uploadFile()` يصنع URL محليًا فقط، و`MessagesService` يحتوي mock upload، و`EvolutionProvider.getMediaBuffer()` يرجع buffer وهمي.

7. scheduled reports وdead-letter غير إنتاجية.
   التقارير تنشئ رابط mock، وdead-letter يكتب logs فقط ولا يخزن أو ينبه.

8. الفوترة موجودة في schema وغير موجودة كـ API module.
   لا توجد وحدة `billing` في `apps/api/src` رغم وجود `Plan`, `Subscription`, `Invoice`, `Payment`.

9. Outbound webhooks موجودة في schema وغير موجودة كخدمة فعلية.
   لا يوجد API لإدارة endpoints الخارجية أو HMAC signing للتسليم.

10. الاختبارات شبه غائبة.
    توجد scripts في package.json، لكن لا توجد ملفات test فعلية كافية لتغطية happy path/permission denied/not found/tenant isolation.

## Mock أو incomplete logic مؤكدة

- `apps/api/src/files/files.service.ts`: Mock S3/MinIO upload.
- `apps/api/src/messages/messages.service.ts`: media upload placeholder/mock.
- `apps/api/src/whatsapp/providers/evolution.provider.ts`: media download mock.
- `apps/worker/src/processors/scheduled-reports.processor.ts`: mock report URL.
- `apps/worker/src/processors/dead-letter.processor.ts`: logging only.
- `packages/ai/src/tools.ts`: tool execution logging skipped/commented as mock phase behavior.

## التحقق التشغيلي

- `pnpm typecheck` داخل الساندبوكس فشل بسبب محاولة pnpm الوصول إلى registry ثم abort بسبب non-TTY.
- بعد تشغيله بصلاحية أعلى وصل إلى `turbo run typecheck` لكنه فشل برمز Windows `3221225781` بدون تفاصيل TypeScript.
- `pnpm test` داخل الساندبوكس فشل لنفس سبب pnpm/registry قبل الوصول للاختبارات.
- لم يتم تشغيل `docker-compose up` أثناء التدقيق.

## تقدير الاكتمال الحالي

- قاعدة البيانات: 70% من ناحية التصميم، أقل من ذلك من ناحية migrations والاستخدام الفعلي.
- API: 55-65%، كثير من endpoints موجودة لكن تحتاج تشديد tenancy/security وإكمال التخزين والفوترة والويب هوكس الخارجية.
- AI/RAG: 50-60%، core موجود لكن يحتاج اختبارات وسلامة أقوى وتسجيل أدوات/تكلفة أدق.
- Workers: 45%، المسارات الأساسية موجودة وبعضها حقيقي، لكن التقارير وdead-letter والتخزين غير مكتملة.
- Realtime: 60%، البنية موجودة لكن تحتاج تحقق ملكية conversation وتشديد CORS.
- Web: 35-45%، صفحات أساسية موجودة لكنها ليست workflow كاملة لكل ما يطلبه البرومبت.
- Tests: أقل من 10%.
- DevOps/docs: 60%، Docker موجود لكن migrations وCI docs/SETUP ناقصة.

## أولويات المرحلة التالية

1. إنشاء `DECISIONS.md` و`SETUP.md` وتثبيت قرارات المرحلة صفر.
2. إصلاح عزل المستأجرين: استخراج المنظمة الفعالة من JWT/membership بدل query/body، وتقييد كل service query بـ `organizationId`.
3. تجربة تطبيق migration المبدئية وتهيئة pgvector على قاعدة فارغة.
4. إكمال refresh token rotation أو توثيق قرار استخدام session/token model الحالي ثم تطبيقه.
5. استبدال mock file/media storage بتخزين S3-compatible فعلي.
6. إضافة Redis readiness وCORS whitelist.
7. إضافة اختبارات tenant isolation للمسارات الأكثر حساسية.
