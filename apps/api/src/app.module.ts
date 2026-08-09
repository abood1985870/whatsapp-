import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
  ],
})
export class AppModule {}
