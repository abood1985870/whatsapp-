import { DncService } from "../../dnc/dnc.service";
import { detectDeterministicIntent } from "@qanoai/ai";

// detectOptOutIntent uses no injected deps, so a bare instance is fine.
const dnc = new DncService(null as any);

describe("DncService.detectOptOutIntent", () => {
  it("detects Arabic opt-out phrases", () => {
    for (const text of ["لا ترسل", "وقف الرسائل", "لا تتواصل معي", "احذف رقمي", "stop", "unsubscribe"]) {
      expect(dnc.detectOptOutIntent(text)).toBe(true);
    }
  });

  it("does not flag ordinary interested messages", () => {
    for (const text of ["كم السعر؟", "أبي أعرف أكثر", "مهتم بالبرنامج", "hello"]) {
      expect(dnc.detectOptOutIntent(text)).toBe(false);
    }
  });

  it("ignores empty input", () => {
    expect(dnc.detectOptOutIntent("")).toBe(false);
  });
});

describe("detectDeterministicIntent", () => {
  it("always returns OPT_OUT when the opt-out flag is set, regardless of text", () => {
    expect(detectDeterministicIntent("أبي أشترك الحين", true)).toBe("OPT_OUT");
  });

  it("detects purchase intent phrases", () => {
    expect(detectDeterministicIntent("كيف أدفع؟", false)).toBe("PURCHASE_INTENT");
    expect(detectDeterministicIntent("أبي أشترك", false)).toBe("PURCHASE_INTENT");
    expect(detectDeterministicIntent("أرسل الرابط", false)).toBe("PURCHASE_INTENT");
  });

  it("detects human-agent requests", () => {
    expect(detectDeterministicIntent("أبي أكلم موظف", false)).toBe("HUMAN_REQUEST");
  });

  it("returns null for neutral messages", () => {
    expect(detectDeterministicIntent("وش مميزات البرنامج؟", false)).toBeNull();
  });
});
