import { Injectable, Logger } from "@nestjs/common";
import WebSocket from "ws";
import { config } from "@qanoai/config";
import {
  RealtimeAIProvider,
  RealtimeEvent,
  RealtimeSession,
  RealtimeSessionConfig,
  RealtimeUsage,
} from "./realtime-ai.provider";

/**
 * OpenAI Realtime API adapter.
 *
 * Uses g711_ulaw in and out so telephony audio passes through untranscoded.
 * Reuses the platform's existing OPENAI_API_KEY — no new vendor.
 */
@Injectable()
export class OpenAiRealtimeProvider implements RealtimeAIProvider {
  readonly id = "OPENAI_REALTIME";
  private readonly logger = new Logger(OpenAiRealtimeProvider.name);

  validateConfiguration() {
    const missing: string[] = [];
    if (!config.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
    return { configured: missing.length === 0, missing };
  }

  async createSession(sessionConfig: RealtimeSessionConfig): Promise<RealtimeSession> {
    const { configured, missing } = this.validateConfiguration();
    if (!configured) throw new Error(`REALTIME_CONFIGURATION_REQUIRED:${missing.join(",")}`);

    const url = `${config.VOICE_REALTIME_URL}?model=${encodeURIComponent(config.VOICE_REALTIME_MODEL)}`;
    const socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    const session = new OpenAiRealtimeSession(socket, sessionConfig, this.logger);
    await session.waitUntilOpen();
    return session;
  }
}

class OpenAiRealtimeSession implements RealtimeSession {
  readonly id: string;
  private handlers: Array<(event: RealtimeEvent) => void> = [];
  private usage: RealtimeUsage = { inputTokens: 0, outputTokens: 0, audioSeconds: 0 };
  private open = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly sessionConfig: RealtimeSessionConfig,
    private readonly logger: Logger
  ) {
    this.id = `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.socket.on("message", (raw) => this.handleMessage(raw));
    this.socket.on("error", (err: any) =>
      this.emit({ type: "error", message: String(err?.message ?? "socket error").slice(0, 300), fatal: true })
    );
    this.socket.on("close", () => {
      this.open = false;
      this.emit({ type: "closed" });
    });
  }

  waitUntilOpen(timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("REALTIME_CONNECT_TIMEOUT")), timeoutMs);
      this.socket.once("open", () => {
        clearTimeout(timer);
        this.open = true;
        this.sendSessionUpdate();
        resolve();
      });
      this.socket.once("error", (err: any) => {
        clearTimeout(timer);
        reject(new Error(String(err?.message ?? "REALTIME_CONNECT_FAILED").slice(0, 200)));
      });
    });
  }

  private sendSessionUpdate() {
    this.send({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        instructions: this.sessionConfig.instructions,
        voice: this.sessionConfig.voice,
        input_audio_format: this.sessionConfig.audioFormat,
        output_audio_format: this.sessionConfig.audioFormat,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: this.sessionConfig.turnDetection?.threshold ?? 0.5,
          silence_duration_ms: this.sessionConfig.turnDetection?.silenceDurationMs ?? 600,
        },
        tools: this.sessionConfig.tools.map((t) => ({
          type: "function",
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        tool_choice: "auto",
        temperature: this.sessionConfig.temperature ?? 0.7,
      },
    });
  }

  private handleMessage(raw: WebSocket.RawData) {
    let event: any;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return; // a malformed frame must not kill the call
    }

    switch (event.type) {
      case "session.created":
      case "session.updated":
        this.emit({ type: "session_ready" });
        break;
      case "response.audio.delta":
        if (event.delta) this.emit({ type: "audio_delta", audioBase64: event.delta });
        break;
      case "response.audio.done":
        this.emit({ type: "audio_done" });
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.emit({ type: "user_transcript", text: String(event.transcript) });
        break;
      case "response.audio_transcript.done":
        if (event.transcript) this.emit({ type: "assistant_transcript", text: String(event.transcript) });
        break;
      case "input_audio_buffer.speech_started":
        this.emit({ type: "speech_started" });
        break;
      case "input_audio_buffer.speech_stopped":
        this.emit({ type: "speech_stopped" });
        break;
      case "response.function_call_arguments.done":
        this.emit({
          type: "tool_call",
          callId: String(event.call_id ?? ""),
          name: String(event.name ?? ""),
          argumentsJson: String(event.arguments ?? "{}"),
        });
        break;
      case "response.done": {
        const usage = event.response?.usage;
        if (usage) {
          this.usage = {
            inputTokens: this.usage.inputTokens + (usage.input_tokens ?? 0),
            outputTokens: this.usage.outputTokens + (usage.output_tokens ?? 0),
            audioSeconds: this.usage.audioSeconds,
          };
        }
        this.emit({ type: "response_done", usage: this.usage });
        break;
      }
      case "error":
        this.emit({
          type: "error",
          message: String(event.error?.message ?? "realtime error").slice(0, 300),
          fatal: false,
        });
        break;
      default:
        break;
    }
  }

  isOpen(): boolean {
    return this.open && this.socket.readyState === WebSocket.OPEN;
  }

  sendAudio(audioBase64: string): void {
    this.send({ type: "input_audio_buffer.append", audio: audioBase64 });
  }

  cancelSpeech(): void {
    this.send({ type: "response.cancel" });
  }

  sendToolResult(callId: string, resultJson: string): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: resultJson },
    });
    this.requestResponse();
  }

  sendSystemMessage(text: string): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
    });
  }

  requestResponse(): void {
    this.send({ type: "response.create" });
  }

  onEvent(handler: (event: RealtimeEvent) => void): void {
    this.handlers.push(handler);
  }

  getUsage(): RealtimeUsage {
    return { ...this.usage };
  }

  async close(): Promise<void> {
    this.open = false;
    try {
      this.socket.close();
    } catch {
      // already closed
    }
  }

  private send(payload: Record<string, unknown>) {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(payload));
    } catch (error: any) {
      this.logger.warn(`Realtime send failed: ${String(error?.message).slice(0, 120)}`);
    }
  }

  private emit(event: RealtimeEvent) {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error: any) {
        // One bad handler must never tear down the call.
        this.logger.error(`Realtime handler threw: ${String(error?.message).slice(0, 200)}`);
      }
    }
  }
}
