import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";
import { EvolutionProvider } from "./providers/evolution.provider";
import { OutboundGuardService } from "./outbound-guard.service";
@Module({ imports: [HttpModule], controllers: [WhatsAppController], providers: [WhatsAppService, EvolutionProvider, OutboundGuardService], exports: [WhatsAppService, EvolutionProvider, OutboundGuardService] })
export class WhatsAppModule {}
