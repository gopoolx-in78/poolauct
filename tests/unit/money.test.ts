import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addPaise, applyBps, ceilToRupee, formatINR, paise, rupees, subPaise } from "@/lib/money";

describe("money", () => {
  it("formats Indian digit grouping", () => {
    expect(formatINR(rupees(563_000))).toBe("₹5,63,000");
    expect(formatINR(rupees(2_000))).toBe("₹2,000");
    expect(formatINR(rupees(10_000_000))).toBe("₹1,00,00,000");
    expect(formatINR(paise(150))).toBe("₹1.50");
    expect(formatINR(paise(5))).toBe("₹0.05");
    expect(formatINR(paise(0))).toBe("₹0");
    expect(formatINR(paise(-250))).toBe("−₹2.50");
  });

  it("reproduces the worked deposit example from the requirements", () => {
    // Winning bid ₹5,65,000, deposit ₹2,000 -> ₹5,63,000 remaining
    expect(formatINR(subPaise(rupees(565_000), rupees(2_000)))).toBe("₹5,63,000");
  });

  it("rejects non-integer inputs", () => {
    expect(() => paise(1.5)).toThrow(RangeError);
    expect(() => paise("12.50")).toThrow(RangeError);
    expect(() => paise(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("applies basis points with half-up rounding to the paisa", () => {
    expect(applyBps(rupees(1000), 500)).toBe(rupees(50));
    expect(applyBps(paise(1), 5000)).toBe(paise(1)); // 0.5 paisa rounds up
    expect(applyBps(paise(1), 4999)).toBe(paise(0));
    expect(() => applyBps(rupees(1), 10_001)).toThrow(RangeError);
    expect(() => applyBps(rupees(1), 1.5)).toThrow(RangeError);
  });

  it("rounds deposits up to the whole rupee", () => {
    expect(ceilToRupee(paise(200_000))).toBe(paise(200_000));
    expect(ceilToRupee(paise(200_001))).toBe(paise(200_100));
  });

  it("property: discount never exceeds the amount and never goes negative", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 15n }), fc.integer({ min: 0, max: 10_000 }), (amt, bps) => {
        const d = applyBps(paise(amt), bps);
        return d >= 0n && d <= amt;
      }),
    );
  });

  it("property: add then subtract is identity", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 15n }), fc.bigInt({ min: 0n, max: 10n ** 15n }), (a, b) => {
        return subPaise(addPaise(paise(a), paise(b)), paise(b)) === paise(a);
      }),
    );
  });
});
