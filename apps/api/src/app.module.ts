import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { MulterModule } from "@nestjs/platform-express";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { WhatsAppModule } from "./whatsapp/whatsapp.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { MessagesModule } from "./messages/messages.module";
import { ContactsModule } from "./contacts/contacts.module";
import { AiAgentsModule } from "./ai-agents/ai-agents.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { AuditModule } from "./audit/audit.module";
import { FilesModule } from "./files/files.module";
import { PlatformModule } from "./platform/platform.module";
import { MarketingModule } from "./marketing/marketing.module";
import { VoiceModule } from "./voice/voice.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // A default ceiling for every multipart upload in the application. Without
    // it multer buffered a request of any size in memory before a controller
    // ever saw it, so a single upload could exhaust the container. Routes that
    // need a tighter limit still declare their own.
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
        fields: 20,
        fieldSize: 100 * 1024,
      },
    }),
    AuthModule,
    OrganizationsModule,
    WhatsAppModule,
    ConversationsModule,
    MessagesModule,
    ContactsModule,
    AiAgentsModule,
    KnowledgeModule,
    AnalyticsModule,
    HealthModule,
    NotificationsModule,
    WebhooksModule,
    AuditModule,
    FilesModule,
    PlatformModule,
    MarketingModule,
    VoiceModule,
  ],
})
export class AppModule {}
