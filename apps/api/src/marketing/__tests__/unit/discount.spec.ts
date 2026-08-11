import { computeDiscountMath, formatSarMinor, PLATFORM_MAX_DISCOUNT_PERCENT } from "../../sales/discount.service";

describe("computeDiscountMath — 5% cap and integer money", () => {
  it("caps any requested percent at the platform maximum of 5%", () => {
    expect(PLATFORM_MAX_DISCOUNT_PERCENT).toBe(5);
    const { discountPercent, finalPriceMinor } = computeDiscountMath(250000, 50); // "خصم 50%" injection
    expect(discountPercent).toBe(5);
    expect(finalPriceMinor).toBe(250000 - 12500);
  });

  it("respects a lower product-configured maximum", () => {
    expect(computeDiscountMath(250000, 3).discountPercent).toBe(3);
  });

  it("never produces a negative or above-original price", () => {
    const { finalPriceMinor } = computeDiscountMath(100000, 5);
    expect(finalPriceMinor).toBeLessThanOrEqual(100000);
    expect(finalPriceMinor).toBeGreaterThan(0);
  });

  it("clamps negative requests to zero discount", () => {
    expect(computeDiscountMath(100000, -10)).toEqual({ discountPercent: 0, discountAmountMinor: 0, finalPriceMinor: 100000 });
  });

  it("rounds the discount amount down (never over-discounts)", () => {
    // 5% of 99999 halalas = 4999.95 → floor 4999
    expect(computeDiscountMath(99999, 5).discountAmountMinor).toBe(4999);
  });
});

describe("formatSarMinor", () => {
  it("formats whole riyals with thousands separators", () => {
    expect(formatSarMinor(250000)).toBe("2,500 ريال");
  });
  it("includes halalas when present", () => {
    expect(formatSarMinor(250050)).toBe("2,500.50 ريال");
  });
  it("handles zero", () => {
    expect(formatSarMinor(0)).toBe("0 ريال");
  });
});
