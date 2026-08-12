import { normalizePhoneStrict } from "@qanoai/shared";

describe("normalizePhoneStrict — Saudi identity", () => {
  it("resolves all common Saudi formats to the same canonical 9665xxxxxxxx", () => {
    const canonical = "966501234567";
    const variants = [
      "0501234567",
      "+966501234567",
      "966501234567",
      "00966501234567",
      "+966 50 123 4567",
      "050-123-4567",
      "(050) 123 4567",
      "0096605 0123 4567",
    ];
    for (const v of variants) {
      const result = normalizePhoneStrict(v);
      expect(result.normalized).toBe(canonical);
      expect(result.valid).toBe(true);
      expect(result.country).toBe("SA");
    }
  });

  it("accepts the bare 9-digit 5xxxxxxxx mobile form", () => {
    expect(normalizePhoneStrict("501234567")).toMatchObject({ normalized: "966501234567", valid: true, country: "SA" });
  });

  it("marks too-short garbage invalid", () => {
    expect(normalizePhoneStrict("123").valid).toBe(false);
    expect(normalizePhoneStrict("").valid).toBe(false);
  });

  it("keeps non-Saudi numbers as INTL without corrupting them", () => {
    const r = normalizePhoneStrict("+14155552671");
    expect(r.country).toBe("INTL");
    expect(r.normalized).toBe("14155552671");
    expect(r.valid).toBe(true);
  });

  it("strips the 00 international prefix", () => {
    expect(normalizePhoneStrict("00447911123456").normalized).toBe("447911123456");
  });
});
