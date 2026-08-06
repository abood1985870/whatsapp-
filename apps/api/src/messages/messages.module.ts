import { Module, forwardRef } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
@Module({ imports: [forwardRef(() => WhatsAppModule)], controllers: [MessagesController], providers: [MessagesService], exports: [MessagesService] })
export class MessagesModule {}
