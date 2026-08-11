/**
 * Telephony provider contract.
 *
 * Business logic (orchestrator, tools, sales) must depend only on this
 * interface. Provider SDKs, TwiML/XML, signature schemes, and HTTP calls
 * live exclusively inside the adapters in this folder.
 */

export type VoiceCapabilityFlag =
  | "EXISTING_NUMBER"
  | "NEW_NUMBER"
  | "SIP"
  | "CALL_FORWARDING"
  | "MEDIA_STREAMING"
  | "BIDIRECTIONAL_AUDIO"
  | "RECORDING"
  | "DTMF"
  | "CALLER_ID"
  | "WEBHOOK_SIGNATURE"
  | "CONCURRENT_CALLS"
  | "REALTIME_TRANSCRIPTION";

/** Mirrors the status vocabulary used in docs/AI_VOICE_EXTERNAL_SETUP_REQUIRED.md. */
export type ProviderStatus =
  | "LIVE_VERIFIED"
  | "CONFIGURED_UNVERIFIED"
  | "CONFIGURATION_REQUIRED"
  | "TEST_ONLY"
  | "ERROR";

export interface ProviderHealth {
  status: ProviderStatus;
  checkedAt: Date;
  /** Human-readable Arabic-safe detail. Never contains secrets. */
  detail?: string;
}

export interface AvailableNumber {
  phoneNumber: string;
  countryCode: string;
  region?: string;
  monthlyCostMinor?: number;
  currency?: string;
  capabilities: VoiceCapabilityFlag[];
}

export interface ValidatedCallWebhook {
  /** Provider's own call identifier — used for idempotency. */
  providerCallId: string;
  /** Distinct id for THIS event, when the provider supplies one. */
  providerEventId?: string;
  eventType: "INCOMING_CALL" | "CALL_STATUS" | "RECORDING" | "DTMF" | "UNKNOWN";
  fromNumber: string;
  toNumber: string;
  callStatus?: string;
  digits?: string;
  raw: Record<string, unknown>;
}

/**
 * What the provider should be told to do with an incoming call. Returned as
 * an opaque, provider-formatted instruction body plus its content type so
 * the controller never has to know about TwiML.
 */
export interface AnswerInstruction {
  contentType: string;
  body: string;
}

export interface VoiceProvider {
  readonly id: string;

  getCapabilities(): VoiceCapabilityFlag[];
  /** Cheap, local check: are the required settings present at all? */
  validateConfiguration(): { configured: boolean; missing: string[] };
  /** Real round-trip against the provider. Must never report LIVE_VERIFIED without one. */
  getHealth(): Promise<ProviderHealth>;

  listAvailableNumbers(countryCode: string): Promise<AvailableNumber[]>;
  provisionNumber(phoneNumber: string): Promise<{ providerNumberId: string }>;
  releaseNumber(providerNumberId: string): Promise<void>;

  /**
   * Verify signature/replay protection and normalize the payload.
   * Returns null when the request is not authentic — the caller must then
   * reject the request rather than trusting any field in it.
   */
  validateWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, unknown>,
    fullUrl: string
  ): ValidatedCallWebhook | null;

  /** Instruction that connects the call to our media-stream WebSocket. */
  buildAnswerInstruction(input: { streamUrl: string; streamToken: string; greeting?: string }): AnswerInstruction;
  /** Instruction that politely declines (kill switch, no entitlement, over budget). */
  buildRejectInstruction(reason: string, spokenMessage?: string): AnswerInstruction;

  endCall(providerCallId: string): Promise<void>;
  getCallStatus(providerCallId: string): Promise<{ status: string; durationSeconds?: number; costMinor?: number } | null>;

  startRecording(providerCallId: string): Promise<{ recordingId: string }>;
  stopRecording(providerCallId: string, recordingId: string): Promise<void>;
}
