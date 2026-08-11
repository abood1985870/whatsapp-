/**
 * Realtime speech-to-speech provider contract.
 *
 * The orchestrator talks only to this interface, so a future provider
 * swap (or an STT→LLM→TTS pipeline) does not touch call handling, tools,
 * or sales logic.
 */

export interface RealtimeSessionConfig {
  instructions: string;
  voice: string;
  /** Telephony-native codec so no transcoding is needed. */
  audioFormat: "g711_ulaw" | "pcm16";
  tools: RealtimeToolDefinition[];
  temperature?: number;
  /** Server-side voice activity detection, which also drives barge-in. */
  turnDetection?: { silenceDurationMs: number; threshold: number };
  language?: string;
}

export interface RealtimeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type RealtimeEvent =
  | { type: "session_ready" }
  | { type: "audio_delta"; audioBase64: string }
  | { type: "audio_done" }
  | { type: "user_transcript"; text: string }
  | { type: "assistant_transcript"; text: string }
  | { type: "speech_started" }
  | { type: "speech_stopped" }
  | { type: "tool_call"; callId: string; name: string; argumentsJson: string }
  | { type: "response_done"; usage?: RealtimeUsage }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "closed" };

export interface RealtimeUsage {
  inputTokens: number;
  outputTokens: number;
  audioSeconds?: number;
}

export interface RealtimeSession {
  readonly id: string;
  isOpen(): boolean;
  /** Append caller audio (base64, session audio format). */
  sendAudio(audioBase64: string): void;
  /** Ask the model to stop speaking immediately (barge-in). */
  cancelSpeech(): void;
  sendToolResult(callId: string, resultJson: string): void;
  /** Inject a system-authored instruction mid-call (e.g. wrap-up notice). */
  sendSystemMessage(text: string): void;
  requestResponse(): void;
  onEvent(handler: (event: RealtimeEvent) => void): void;
  getUsage(): RealtimeUsage;
  close(): Promise<void>;
}

export interface RealtimeAIProvider {
  readonly id: string;
  validateConfiguration(): { configured: boolean; missing: string[] };
  createSession(config: RealtimeSessionConfig): Promise<RealtimeSession>;
}
