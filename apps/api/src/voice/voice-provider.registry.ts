import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { config } from "@qanoai/config";
import { VoiceProvider } from "./providers/voice-provider.interface";
import { SimulationVoiceProvider } from "./providers/simulation-voice.provider";
import { TwilioVoiceProvider } from "./providers/twilio-voice.provider";

/**
 * Resolves which telephony adapter an organization uses. Per-organization
 * configuration wins; the deployment default (VOICE_PROVIDER) is the
 * fallback, and Simulation is the safe default so nothing ever accidentally
 * dials a real network.
 */
@Injectable()
export class VoiceProviderRegistry {
  constructor(
    private readonly simulation: SimulationVoiceProvider,
    private readonly twilio: TwilioVoiceProvider
  ) {}

  byId(providerId: string): VoiceProvider {
    return providerId === "TWILIO" ? this.twilio : this.simulation;
  }

  all(): VoiceProvider[] {
    return [this.simulation, this.twilio];
  }

  async forOrganization(organizationId: string): Promise<VoiceProvider> {
    const stored = await prisma.voiceProviderConfig.findFirst({
      where: { organizationId, status: { in: ["LIVE_VERIFIED", "CONFIGURED_UNVERIFIED"] } },
      orderBy: { updatedAt: "desc" },
    });
    if (stored) return this.byId(stored.provider);
    return this.byId(config.VOICE_PROVIDER);
  }
}
