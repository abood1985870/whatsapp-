import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { MarketingModule } from "../marketing/marketing.module";
import { VoiceController } from "./voice.controller";
import { VoiceWebhooksController } from "./voice-webhooks.controller";
import { VoiceAgentsService } from "./voice-agents.service";
import { VoiceNumbersService } from "./voice-numbers.service";
import { VoiceCallsService } from "./voice-calls.service";
import { VoiceSettingsService } from "./voice-settings.service";
import { VoiceUsageService } from "./voice-usage.service";
import { VoiceDiagnosticsService } from "./voice-diagnostics.service";
import { CallerIdentityService } from "./caller-identity.service";
import { CallOrchestratorService } from "./call-orchestrator.service";
import { MediaStreamGateway } from "./media-stream.gateway";
import { StreamTokenService } from "./stream-token.service";
import { VerificationService } from "./verification.service";
import { VoiceGuard } from "./guards/voice.guard";
import { VoiceProviderRegistry } from "./voice-provider.registry";
import { SimulationVoiceProvider } from "./providers/simulation-voice.provider";
import { TwilioVoiceProvider } from "./providers/twilio-voice.provider";
import { OpenAiRealtimeProvider } from "./providers/openai-realtime.provider";
import { VoiceToolExecutorService } from "./tools/voice-tool-executor.service";

@Module({
  imports: [AuditModule, WhatsAppModule, MarketingModule],
  controllers: [VoiceController, VoiceWebhooksController],
  providers: [
    VoiceGuard,
    VoiceProviderRegistry,
    SimulationVoiceProvider,
    TwilioVoiceProvider,
    OpenAiRealtimeProvider,
    VoiceAgentsService,
    VoiceNumbersService,
    VoiceCallsService,
    VoiceSettingsService,
    VoiceUsageService,
    VoiceDiagnosticsService,
    CallerIdentityService,
    CallOrchestratorService,
    MediaStreamGateway,
    StreamTokenService,
    VerificationService,
    VoiceToolExecutorService,
  ],
  exports: [CallOrchestratorService, VoiceSettingsService],
})
export class VoiceModule {}
