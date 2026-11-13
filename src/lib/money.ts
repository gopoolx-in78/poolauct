/**
 * Money helpers. All amounts are integer paise held as `bigint` (TD-04).
 * Never use floating-point arithmetic for money.
 */
declare const paiseBrand: unique symbol;
export type Paise = bigint & { readonly [paiseBrand]: true };

const PAISE_PER_RUPEE = 100n;
const BPS_DENOMINATOR = 10_000n;

export function paise(value: bigint | number | string): Paise {
  let v: bigint;
  if (typeof value === "bigint") v = value;
  else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError("Paise must be a safe integer");
    v = BigInt(value);
  } else {
    if (!/^-?\d+$/.test(value)) throw new RangeError("Paise string must be an integer");
    v = BigInt(value);
  }
  return v as Paise;
}

export function rupees(whole: bigint | number): Paise {
  return paise(BigInt(whole) * PAISE_PER_RUPEE);
}

export function addPaise(a: Paise, b: Paise): Paise {
  return paise(a + b);
}

export function subPaise(a: Paise, b: Paise): Paise {
  return paise(a - b);
}

/** Basis-point percentage of an amount, rounded half-up to the nearest paisa. */
export function applyBps(amount: Paise, bps: number): Paise {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError("bps must be 0..10000");
  const numerator = amount * BigInt(bps);
  const q = numerator / BPS_DENOMINATOR;
  const r = numerator % BPS_DENOMINATOR;
  return paise(r * 2n >= BPS_DENOMINATOR ? q + 1n : q);
}

/** Round up to the next whole rupee (used for percentage deposits, TD-07). */
export function ceilToRupee(amount: Paise): Paise {
  const r = amount % PAISE_PER_RUPEE;
  return paise(r === 0n ? amount : amount + (PAISE_PER_RUPEE - r));
}

const inrFormatter = new Intl.NumberFormat("en-IN");

/**
 * Formats paise as Indian rupees, e.g. 56300000n -> "₹5,63,000".
 * Shows paise only when non-zero (or when `alwaysShowPaise` is set).
 */
export function formatINR(amount: Paise, opts: { alwaysShowPaise?: boolean } = {}): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / PAISE_PER_RUPEE;
  const fraction = abs % PAISE_PER_RUPEE;
  // Intl.NumberFormat accepts bigint, preserving precision for large values.
  let out = `₹${inrFormatter.format(whole)}`;
  if (fraction !== 0n || opts.alwaysShowPaise) out += `.${fraction.toString().padStart(2, "0")}`;
  return negative ? `−${out}` : out;
}
