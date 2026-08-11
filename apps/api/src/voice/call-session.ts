import { RealtimeSession } from "./providers/realtime-ai.provider";
import { CallStatus } from "./call-state-machine";

/**
 * Per-call in-memory state. Everything mutable about a call lives on an
 * instance of this class, held in a Map keyed by callId — there is no
 * module-level mutable call state, so concurrent calls cannot mix context,
 * transcripts, tenants, or audio.
 */
export class CallSession {
  status: CallStatus = "RINGING";
  realtime: RealtimeSession | null = null;
  /** Function that writes audio back to the telephony socket. */
  sendAudioToCaller: ((audioBase64: string) => void) | null = null;
  closeTelephony: (() => void) | null = null;

  turnIndex = 0;
  transcript: Array<{ speaker: string; text: string }> = [];
  toolCallCount = 0;
  consecutiveToolFailures = 0;
  repeatedQuestionCount = 0;
  lastUserUtterance = "";

  aiAudioMs = 0;
  followupCount = 0;

  lastCallerAudioAt = Date.now();
  silenceStage: 0 | 1 | 2 = 0;
  startedAt = Date.now();
  answeredAt: number | null = null;
  wrapUpNoticeSent = false;
  ending = false;

  timers: NodeJS.Timeout[] = [];

  constructor(
    readonly callId: string,
    readonly organizationId: string,
    readonly correlationId: string
  ) {}

  addTimer(timer: NodeJS.Timeout) {
    this.timers.push(timer);
  }

  clearTimers() {
    for (const t of this.timers) clearInterval(t as any);
    this.timers = [];
  }

  durationSeconds(): number {
    return Math.max(0, Math.round((Date.now() - this.startedAt) / 1000));
  }
}
