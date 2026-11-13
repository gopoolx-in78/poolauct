import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { paise } from "@/lib/money";
import { discountBpsAt, discountedPrice, feeFor, formatBps, validateTiers } from "@/modules/poolx/pricing";

describe("PoolX pricing (mirror of poolx.discounted_price / fee_for / discount_bps_at)", () => {
  it("matches the SQL examples asserted in supabase/tests/0003_payments_poolx.test.sql", () => {
    expect(discountedPrice(paise(999), 1500)).toBe(paise(849));
    expect(discountedPrice(paise(1000000), 1000)).toBe(paise(900000));
    expect(discountedPrice(paise(1000000), 0)).toBe(paise(1000000));
  });

  it("rounds the discount half-up to the paisa", () => {
    expect(discountedPrice(paise(1), 5000)).toBe(paise(0)); // discount 0.5 → 1
    expect(discountedPrice(paise(1), 4999)).toBe(paise(1)); // discount 0.4999 → 0
    expect(feeFor(paise(333), 150)).toBe(paise(5)); // 4.995 → 5
  });

  it("picks the highest reached tier", () => {
    const tiers = [
      { threshold: 10, discountBps: 500 },
      { threshold: 20, discountBps: 1000 },
      { threshold: 40, discountBps: 1500 },
    ];
    expect(discountBpsAt(tiers, 0)).toBe(0);
    expect(discountBpsAt(tiers, 19)).toBe(500);
    expect(discountBpsAt(tiers, 20)).toBe(1000);
    expect(discountBpsAt(tiers, 500)).toBe(1500);
  });

  it("validates tiers like the database trigger", () => {
    expect(
      validateTiers([
        { threshold: 2, discountBps: 1000 },
        { threshold: 3, discountBps: 1500 },
      ]),
    ).toBeNull();
    expect(
      validateTiers([
        { threshold: 2, discountBps: 1000 },
        { threshold: 3, discountBps: 500 },
      ]),
    ).toMatch(/bigger discount/);
    expect(
      validateTiers([
        { threshold: 2, discountBps: 1000 },
        { threshold: 2, discountBps: 1500 },
      ]),
    ).toMatch(/once/);
    expect(validateTiers([{ threshold: 0, discountBps: 10 }])).toMatch(/1 or more/);
    expect(validateTiers([{ threshold: 1, discountBps: 9500 }])).toMatch(/90%/);
  });

  it("property: price never negative, never above base, and non-increasing as discount grows", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        fc.integer({ min: 0, max: 9000 }),
        fc.integer({ min: 0, max: 9000 }),
        (b, x, y) => {
          const base = paise(b);
          const [lo, hi] = x <= y ? [x, y] : [y, x];
          const pLo = discountedPrice(base, lo);
          const pHi = discountedPrice(base, hi);
          return pLo >= 0n && pLo <= base && pHi <= pLo;
        },
      ),
    );
  });

  it("formats basis points", () => {
    expect(formatBps(1000)).toBe("10%");
    expect(formatBps(1050)).toBe("10.5%");
  });
});
