import { Injectable } from "@nestjs/common";
import {
  AnswerInstruction,
  AvailableNumber,
  ProviderHealth,
  ValidatedCallWebhook,
  VoiceCapabilityFlag,
  VoiceProvider,
} from "./voice-provider.interface";

/**
 * TEST_ONLY provider. Drives the entire voice stack — orchestrator, tools,
 * sales logic, transcripts, analytics — with no carrier, no phone number,
 * and no spend. It never places or receives a real call, and it reports
 * TEST_ONLY so no UI can present it as a live connection.
 */
@Injectable()
export class SimulationVoiceProvider implements VoiceProvider {
  readonly id = "SIMULATION";

  getCapabilities(): VoiceCapabilityFlag[] {
    return ["MEDIA_STREAMING", "BIDIRECTIONAL_AUDIO", "DTMF", "CALLER_ID", "CONCURRENT_CALLS"];
  }

  validateConfiguration() {
    return { configured: true, missing: [] };
  }

  async getHealth(): Promise<ProviderHealth> {
    return { status: "TEST_ONLY", checkedAt: new Date(), detail: "مزود محاكاة للتطوير والاختبار فقط" };
  }

  async listAvailableNumbers(): Promise<AvailableNumber[]> {
    return [];
  }

  async provisionNumber(): Promise<{ providerNumberId: string }> {
    throw new Error("SIMULATION_PROVIDER_CANNOT_PROVISION_NUMBERS");
  }

  async releaseNumber(): Promise<void> {
    throw new Error("SIMULATION_PROVIDER_CANNOT_RELEASE_NUMBERS");
  }

  /**
   * Simulated calls are started through the authenticated internal API, not
   * through an unauthenticated webhook, so this adapter accepts nothing.
   */
  validateWebhook(): ValidatedCallWebhook | null {
    return null;
  }

  buildAnswerInstruction(input: { streamUrl: string; streamToken: string; greeting?: string }): AnswerInstruction {
    return {
      contentType: "application/json",
      body: JSON.stringify({ action: "CONNECT_STREAM", streamUrl: input.streamUrl, token: input.streamToken }),
    };
  }

  buildRejectInstruction(reason: string, spokenMessage?: string): AnswerInstruction {
    return {
      contentType: "application/json",
      body: JSON.stringify({ action: "REJECT", reason, spokenMessage }),
    };
  }

  async endCall(): Promise<void> {
    // Simulated calls end in the orchestrator; nothing external to signal.
  }

  async getCallStatus(): Promise<{ status: string; durationSeconds?: number; costMinor?: number } | null> {
    // No external truth exists for a simulated call, and inventing one would
    // be fake telemetry. The orchestrator's own record is authoritative.
    return null;
  }

  async startRecording(): Promise<{ recordingId: string }> {
    throw new Error("SIMULATION_PROVIDER_CANNOT_RECORD");
  }

  async stopRecording(): Promise<void> {
    throw new Error("SIMULATION_PROVIDER_CANNOT_RECORD");
  }
}
