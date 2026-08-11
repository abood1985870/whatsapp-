import { parseEnvBoolean } from "../../../../../packages/config/src/index";

/**
 * `z.coerce.boolean()` is JavaScript truthiness: every non-empty string is
 * true. Three settings used it, so REDIS_DISABLED="false" was TRUE — and for
 * that one specifically, being wrongly true removed the AI rate limit
 * entirely. Someone writing the obvious thing to keep a feature off turned it
 * on.
 *
 * This test pins both halves: that the old behaviour really was broken, and
 * that the replacement reads what a human meant.
 */
describe("environment booleans", () => {
  const parse = (raw: string) => parseEnvBoolean(raw);

  it.each(["false", "FALSE", "False", "0", "no", "off", ""])("reads %s as false", (input) => {
    expect(parse(input)).toBe(false);
  });

  it.each(["true", "TRUE", "1", "yes", "on"])("reads %s as true", (input) => {
    expect(parse(input)).toBe(true);
  });

  it("demonstrates what the old coercion did", () => {
    // z.coerce.boolean() is Boolean(value): every non-empty string is true, so
    // every one of the strings above that should be FALSE was true.
    expect(Boolean("false")).toBe(true);
    expect(Boolean("0")).toBe(true);
    expect(Boolean("off")).toBe(true);
  });

  it("passes a real boolean straight through", () => {
    expect(parseEnvBoolean(true)).toBe(true);
    expect(parseEnvBoolean(false)).toBe(false);
  });

  it("refuses a value it cannot interpret rather than guessing", () => {
    expect(() => parse("maybe")).toThrow();
  });
});
