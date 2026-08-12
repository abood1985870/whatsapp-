// safety.ts pulls in the OpenAI client and the config module, both of which
// read process.env at import time. Neither is needed to exercise the masker.
jest.mock("../../../../../../packages/ai/src/client", () => ({ openai: {} }));
jest.mock("@qanoai/config", () => ({ config: {} }));

import { maskPII, MAX_MASK_INPUT_CHARS } from "../../../../../../packages/ai/src/safety";

/**
 * The original masker was quadratic in the length of a digit-and-separator run:
 * a single 80,000-character WhatsApp message blocked the event loop for about
 * four seconds, and the body limit in front of it allows far larger. These
 * tests pin both halves of the fix — the bounded patterns and the input clamp.
 */
describe("maskPII", () => {
  it("still masks the things it exists to mask", () => {
    expect(maskPII("email me at ali@example.com please")).toBe("email me at [EMAIL] please");
    expect(maskPII("card 4111 1111 1111 1111 ok")).toBe("card [CREDIT_CARD] ok");
    expect(maskPII("ssn 123-45-6789")).toBe("ssn [SSN]");
  });

  it("leaves ordinary Arabic text alone", () => {
    const text = "السلام عليكم، أبي أعرف سعر الباقة الشهرية";
    expect(maskPII(text)).toBe(text);
  });

  it("does not mangle a short number that is not a card", () => {
    expect(maskPII("طلبي رقم 4421")).toBe("طلبي رقم 4421");
  });

  it("truncates input beyond the mask ceiling", () => {
    const long = "a".repeat(MAX_MASK_INPUT_CHARS + 500);
    expect(maskPII(long).length).toBe(MAX_MASK_INPUT_CHARS);
  });

  it("handles the pathological digit-separator run in linear time", () => {
    // This exact shape drove the original regex quadratic.
    const attack = "1 ".repeat(40000) + "!";
    const started = Date.now();
    maskPII(attack);
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("handles the pathological email backtracking case", () => {
    const attack = "a".repeat(50000) + "@" + "a.".repeat(20000) + "!";
    const started = Date.now();
    maskPII(attack);
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("is safe on empty and undefined-ish input", () => {
    expect(maskPII("")).toBe("");
  });
});
