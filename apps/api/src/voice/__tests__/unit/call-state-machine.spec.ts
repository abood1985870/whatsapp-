import {
  assertTransition,
  canTransition,
  CallStatus,
  isLive,
  isTerminal,
  TERMINAL_STATUSES,
} from "../../call-state-machine";

describe("call state machine", () => {
  it("walks the normal happy path", () => {
    const path: CallStatus[] = ["RINGING", "CONNECTING", "AI_SESSION_STARTING", "ACTIVE", "ENDING", "COMPLETED"];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("allows conversation states to interleave freely while the call is up", () => {
    const conversational: CallStatus[] = ["LISTENING", "THINKING", "SPEAKING", "TOOL_EXECUTION", "VERIFYING"];
    for (const from of conversational) {
      for (const to of conversational) {
        if (from === to) continue;
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it("rejects skipping straight from RINGING to ACTIVE", () => {
    expect(canTransition("RINGING", "ACTIVE")).toBe(false);
    expect(() => assertTransition("RINGING", "ACTIVE")).toThrow(/INVALID_CALL_TRANSITION/);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of TERMINAL_STATUSES) {
      for (const to of ["ACTIVE", "RINGING", "ENDING"] as CallStatus[]) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  it("treats a self-transition as a no-op, not a valid move", () => {
    expect(canTransition("ACTIVE", "ACTIVE")).toBe(false);
  });

  it("can always fail or disconnect from a live state", () => {
    const live: CallStatus[] = ["CONNECTING", "AI_SESSION_STARTING", "ACTIVE", "SPEAKING", "TOOL_EXECUTION"];
    for (const status of live) {
      expect(canTransition(status, "FAILED")).toBe(true);
      expect(canTransition(status, "DISCONNECTED")).toBe(true);
    }
  });

  it("classifies terminal and live states", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("ACTIVE")).toBe(false);
    expect(isLive("ACTIVE")).toBe(true);
    expect(isLive("RINGING")).toBe(false);
    expect(isLive("FAILED")).toBe(false);
  });
});
