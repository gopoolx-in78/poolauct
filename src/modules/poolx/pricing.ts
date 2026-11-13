import { paise, type Paise } from "@/lib/money";

/**
 * PoolX pricing. MUST match the SQL in supabase/migrations/20261113000008_poolx_functions.sql
 * (`poolx.discounted_price`, `poolx.fee_for`, `poolx.discount_bps_at`). The database is authoritative; this mirror is
 * for display and validation only.
 */
export type Tier = { threshold: number; discountBps: number };

/** base − round_half_up(base × bps / 10 000) */
export function discountedPrice(base: Paise, bps: number): Paise {
  assertBps(bps, 9000);
  return paise(base - (base * BigInt(bps) + 5000n) / 10000n);
}

/** round_half_up(subtotal × bps / 10 000) */
export function feeFor(subtotal: Paise, bps: number): Paise {
  assertBps(bps, 10000);
  return paise((subtotal * BigInt(bps) + 5000n) / 10000n);
}

/** Highest tier discount whose threshold has been reached (0 if none). */
export function discountBpsAt(tiers: Tier[], basisValue: number): number {
  return tiers.reduce((best, t) => (t.threshold <= basisValue && t.discountBps > best ? t.discountBps : best), 0);
}

/** Tiers must have unique, increasing thresholds with strictly increasing discounts (mirrors the DB trigger). */
export function validateTiers(tiers: Tier[]): string | null {
  if (tiers.length > 10) return "Use at most 10 tiers.";
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (!Number.isInteger(t.threshold) || t.threshold < 1) return "Thresholds must be whole numbers of 1 or more.";
    if (!Number.isInteger(t.discountBps) || t.discountBps < 1 || t.discountBps > 9000)
      return "Discounts must be between 0.01% and 90%.";
    const prev = sorted[i - 1];
    if (prev && prev.threshold === t.threshold) return "Each threshold can be used once.";
    if (prev && t.discountBps <= prev.discountBps) return "Each higher threshold needs a bigger discount.";
  }
  return null;
}

function assertBps(bps: number, max: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > max) throw new RangeError(`bps must be an integer 0..${max}`);
}

/** Basis points → display percentage, e.g. 1050 → "10.5%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
}
