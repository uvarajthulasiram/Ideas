import { describe, expect, it } from "vitest";
import { formatMoney, isValidCurrency, minorUnitDigits, percentOf, toMinor } from "./money";

describe("currencies", () => {
  it("knows minor units", () => {
    expect(minorUnitDigits("USD")).toBe(2);
    expect(minorUnitDigits("CAD")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
  });

  it("validates codes", () => {
    expect(isValidCurrency("USD")).toBe(true);
    expect(isValidCurrency("CAD")).toBe(true);
    expect(isValidCurrency("usd")).toBe(false);
    expect(isValidCurrency("XYZ")).toBe(false);
  });

  it("converts typed amounts to minor units without float drift", () => {
    expect(toMinor(19.99, "USD")).toBe(1999);
    expect(toMinor(0.1 + 0.2, "CAD")).toBe(30);
    expect(toMinor(1500, "JPY")).toBe(1500);
  });

  it("formats in the site's locale", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(123456, "CAD", "en-CA")).toBe("$1,234.56");
    expect(formatMoney(5000, "CAD", "en-US")).toBe("CA$50.00");
  });

  it("refuses fractional minor units", () => {
    expect(() => formatMoney(10.5, "USD", "en-US")).toThrow(RangeError);
  });
});

describe("percentOf", () => {
  it("rounds half up to the cent", () => {
    expect(percentOf(1000, 10.25)).toBe(103); // 102.5
    expect(percentOf(999, 10)).toBe(100); // 99.9
    expect(percentOf(994, 10)).toBe(99); // 99.4
  });

  it("is exact where floats are not", () => {
    // 0.1 * 3 in floating point is 0.30000000000000004
    expect(percentOf(300, 0.1)).toBe(0); // 0.3 cents
    expect(percentOf(100_000_000, 15.6)).toBe(15_600_000);
    expect(percentOf(12345, 7.123)).toBe(879); // 879.33...
  });

  it("handles 0 and 100 percent, and negative amounts symmetrically", () => {
    expect(percentOf(4321, 0)).toBe(0);
    expect(percentOf(4321, 100)).toBe(4321);
    expect(percentOf(-1000, 10.25)).toBe(-103);
  });

  it("rejects rates with more than 3 decimals", () => {
    expect(() => percentOf(1000, 10.0001)).toThrow(RangeError);
  });
});
