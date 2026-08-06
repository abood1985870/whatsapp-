import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";
import { EvolutionProvider } from "./providers/evolution.provider";
@Module({ imports: [HttpModule], controllers: [WhatsAppController], providers: [WhatsAppService, EvolutionProvider], exports: [WhatsAppService, EvolutionProvider] })
export class WhatsAppModule {}
