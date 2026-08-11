/**
 * Explicit call state machine. Pure functions, no I/O — the orchestrator
 * persists the outcome. Invalid transitions are rejected rather than
 * silently applied, so call state can never drift into a nonsense value.
 */

export type CallStatus =
  | "RINGING"
  | "CONNECTING"
  | "AI_SESSION_STARTING"
  | "ACTIVE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "TOOL_EXECUTION"
  | "VERIFYING"
  | "ENDING"
  | "COMPLETED"
  | "DISCONNECTED"
  | "FAILED";

export const TERMINAL_STATUSES: CallStatus[] = ["COMPLETED", "DISCONNECTED", "FAILED"];

/** In-conversation states that may freely interleave while the call is up. */
const CONVERSATION_STATES: CallStatus[] = [
  "ACTIVE",
  "LISTENING",
  "THINKING",
  "SPEAKING",
  "TOOL_EXECUTION",
  "VERIFYING",
];

const TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  RINGING: ["CONNECTING", "DISCONNECTED", "FAILED"],
  CONNECTING: ["AI_SESSION_STARTING", "DISCONNECTED", "FAILED"],
  AI_SESSION_STARTING: ["ACTIVE", "ENDING", "DISCONNECTED", "FAILED"],
  ACTIVE: [...CONVERSATION_STATES, "ENDING", "DISCONNECTED", "FAILED"],
  LISTENING: [...CONVERSATION_STATES, "ENDING", "DISCONNECTED", "FAILED"],
  THINKING: [...CONVERSATION_STATES, "ENDING", "DISCONNECTED", "FAILED"],
  SPEAKING: [...CONVERSATION_STATES, "ENDING", "DISCONNECTED", "FAILED"],
  TOOL_EXECUTION: [...CONVERSATION_STATES, "ENDING", "DISCONNECTED", "FAILED"],
  VERIFYING: [...CONVERSATION_STATES, "ENDING", "DISCONNECTED", "FAILED"],
  ENDING: ["COMPLETED", "DISCONNECTED", "FAILED"],
  COMPLETED: [],
  DISCONNECTED: [],
  FAILED: [],
};

export function isTerminal(status: CallStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: CallStatus, to: CallStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: CallStatus, to: CallStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_CALL_TRANSITION:${from}->${to}`);
  }
}

/** Statuses in which the caller is still on the line and billable. */
export function isLive(status: CallStatus): boolean {
  return !isTerminal(status) && status !== "RINGING";
}
