jest.mock("@qanoai/config", () => ({ config: {} }));

import {
  normalizeDigits,
  mentionsDiscount,
  mentionsPrice,
  extractAmounts,
  findUnauthorizedAmounts,
} from "../../../../../../packages/ai/src/output-guard";

/**
 * The rule the product depends on: prices and discounts come from the backend,
 * never from the model. The guard enforcing it was written against ASCII digits
 * and required a currency word — so the exact output an Arabic model produces
 * went straight through it.
 */
describe("normalizeDigits", () => {
  it("rewrites Arabic-Indic digits", () => {
    expect(normalizeDigits("٢٥٠٠")).toBe("2500");
    expect(normalizeDigits("خصم ٢٠٪")).toBe("خصم 20٪");
  });

  it("rewrites Persian digits", () => {
    expect(normalizeDigits("۲۵۰۰")).toBe("2500");
  });

  it("leaves ASCII alone", () => {
    expect(normalizeDigits("2500 SAR")).toBe("2500 SAR");
  });
});

describe("mentionsDiscount", () => {
  it.each([
    ["خصم 20%", "the case that already worked"],
    ["خصم ٢٠٪", "Arabic digits AND the Arabic percent sign"],
    ["٢٠٪", "a bare Arabic percentage"],
    ["20% off", "English"],
    ["تخفيض ١٥٪", "a different Arabic word for discount"],
    ["حسم ١٠٪", "another one"],
    ["أقدر أعطيك ٪١٥", "percent sign leading, as Arabic often writes it"],
  ])("catches %s (%s)", (text) => {
    expect(mentionsDiscount(text)).toBe(true);
  });

  it("does not fire on ordinary text", () => {
    expect(mentionsDiscount("أهلاً بك، كيف أقدر أساعدك اليوم؟")).toBe(false);
    expect(mentionsDiscount("عندنا ٣ باقات")).toBe(false);
  });
});

describe("mentionsPrice", () => {
  it.each([
    ["السعر 2500 ريال", "the case that already worked"],
    ["السعر ٢٥٠٠ ريال", "Arabic digits"],
    ["٢٥٠٠ ر.س", "the abbreviation, with no full currency word"],
    ["السعر ٢٥٠٠", "a price word and a number, no currency at all"],
    ["يكلف ٣٠٠٠", "a different price verb"],
    ["2500 SAR", "English"],
    ["price is 2500", "English price word"],
    ["التكلفة ١٢٠٠ ريالاً", "an inflected form"],
  ])("catches %s (%s)", (text) => {
    expect(mentionsPrice(text)).toBe(true);
  });

  it("does not fire on a message with no money in it", () => {
    expect(mentionsPrice("راح أرسل لك التفاصيل على الواتساب")).toBe(false);
    expect(mentionsPrice("نشتغل من ٨ إلى ٥")).toBe(false);
  });
});

describe("extractAmounts", () => {
  it("reads Arabic digits and thousands separators", () => {
    expect(extractAmounts("السعر ٢,٥٠٠ ريال")).toContain(2500);
    expect(extractAmounts("2,500 and 3000")).toEqual([2500, 3000]);
  });
});

describe("findUnauthorizedAmounts", () => {
  const catalogue = [2500, 5000];

  it("passes a price that is in the catalogue", () => {
    expect(findUnauthorizedAmounts("السعر ٢٥٠٠ ريال", catalogue)).toEqual([]);
  });

  it("flags a price the model invented", () => {
    expect(findUnauthorizedAmounts("أقدر أسويها لك بـ ١٨٠٠ ريال", catalogue)).toEqual([1800]);
  });

  it("ignores small numbers that are not prices", () => {
    expect(findUnauthorizedAmounts("السعر ٢٥٠٠ ريال وخلال ٣ أيام", catalogue)).toEqual([]);
  });

  it("stays silent when the text is not about money at all", () => {
    expect(findUnauthorizedAmounts("نتواصل معك خلال ٤٨ ساعة", catalogue)).toEqual([]);
  });
});
