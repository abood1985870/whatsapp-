import { Module, forwardRef } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { ConversationsModule } from "../conversations/conversations.module";
import { MessagesModule } from "../messages/messages.module";
import { ContactsModule } from "../contacts/contacts.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { MarketingModule } from "../marketing/marketing.module";
@Module({ imports: [ConversationsModule, MessagesModule, ContactsModule, forwardRef(() => WhatsAppModule), MarketingModule], controllers: [WebhooksController], providers: [WebhooksService], exports: [WebhooksService] })
export class WebhooksModule {}
