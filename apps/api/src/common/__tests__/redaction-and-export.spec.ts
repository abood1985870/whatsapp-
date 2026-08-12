import {
  redactPII,
  redactObject,
  maskPhoneNumber,
  csvCell,
  csvRow,
  clampPage,
} from "@qanoai/shared";

/**
 * Three different places persisted or printed raw customer text: call
 * transcripts, application logs, and stored webhook payloads. None of them
 * needed the clear text to work.
 */
describe("redactPII", () => {
  it.each([
    ["رقمي 0501234567 تواصل معي", "[PHONE]"],
    ["جوالي +966501234567", "[PHONE]"],
    ["الهوية 1012345678", "[ID]"],
    ["الايبان SA0380000000608010167519", "[IBAN]"],
    ["البطاقة 4111 1111 1111 1111", "[CARD]"],
    ["ايميلي ali@example.com", "[EMAIL]"],
  ])("redacts %s", (input, marker) => {
    expect(redactPII(input)).toContain(marker);
  });

  it("does not mangle ordinary Arabic", () => {
    const text = "السلام عليكم، أبي أعرف عن الباقة";
    expect(redactPII(text)).toBe(text);
  });

  it("leaves a small number that is not an identifier alone", () => {
    expect(redactPII("عندي 3 طلبات")).toBe("عندي 3 طلبات");
  });

  it("is safe on empty input", () => {
    expect(redactPII(null)).toBe("");
    expect(redactPII(undefined)).toBe("");
  });
});

describe("maskPhoneNumber", () => {
  it("keeps enough to recognise, not enough to dial", () => {
    const masked = maskPhoneNumber("+966501234567");
    expect(masked).toContain("***");
    expect(masked).not.toContain("1234");
  });

  it("does not leak a short string by returning it unchanged", () => {
    expect(maskPhoneNumber("123")).toBe("***");
  });
});

describe("redactObject", () => {
  it("drops secrets entirely", () => {
    const out: any = redactObject({ password: "hunter2", accessToken: "abc", apiKey: "k" });
    expect(out.password).toBe("[REDACTED]");
    expect(out.accessToken).toBe("[REDACTED]");
    expect(out.apiKey).toBe("[REDACTED]");
  });

  it("masks personal fields rather than dropping them, so logs stay useful", () => {
    const out: any = redactObject({ phoneNumber: "+966501234567" });
    expect(out.phoneNumber).toContain("***");
    expect(out.phoneNumber).not.toContain("1234567");
  });

  it("redacts identifiers inside free text", () => {
    const out: any = redactObject({ text: "رقمي 0501234567" });
    expect(out.text).toContain("[PHONE]");
  });

  it("recurses without running away on a deep structure", () => {
    let deep: any = "0501234567";
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => redactObject(deep)).not.toThrow();
  });

  it("truncates long arrays — a log line is not a data export", () => {
    const out: any = redactObject(Array.from({ length: 100 }, (_, i) => i));
    expect(out.length).toBe(20);
  });
});

describe("csvCell", () => {
  it("quotes a value containing a comma", () => {
    expect(csvCell("شركة الرواد, المحدودة")).toBe('"شركة الرواد, المحدودة"');
  });

  it("doubles internal quotes", () => {
    expect(csvCell('شركة "الرواد"')).toBe('"شركة ""الرواد"""');
  });

  it("neutralises a formula so Excel does not execute it", () => {
    // Without the leading apostrophe this becomes live content in whoever
    // opens the export.
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1234")).toContain("'+1234");
    expect(csvCell("@SUM(A1)")).toContain("'@SUM(A1)");
  });

  it("keeps a row aligned when a field contains a comma", () => {
    const row = csvRow(["a", "b,c", "d"]);
    expect(row.split('","').length).toBe(3);
  });

  it("handles null and undefined", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("clampPage", () => {
  it("defaults a missing page and limit", () => {
    expect(clampPage(undefined, undefined)).toMatchObject({ page: 1, limit: 25, skip: 0 });
  });

  it("turns garbage into defaults instead of NaN", () => {
    // skip: NaN is a Prisma error — a 500 from a malformed URL.
    const result = clampPage("abc", "xyz");
    expect(Number.isNaN(result.skip)).toBe(false);
    expect(result).toMatchObject({ page: 1, limit: 25 });
  });

  it("refuses a negative page", () => {
    expect(clampPage(-5, 10).skip).toBe(0);
  });

  it("caps an oversized limit", () => {
    expect(clampPage(1, 1_000_000, { maxLimit: 100 }).take).toBe(100);
  });

  it("computes skip from the clamped values", () => {
    expect(clampPage(3, 20)).toMatchObject({ skip: 40, take: 20 });
  });
});
