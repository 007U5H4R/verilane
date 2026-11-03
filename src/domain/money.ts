/**
 * Money is always paise (1 rupee = 100 paise), stored as an integer, so
 * arithmetic never hits floating-point rounding. The brand prevents a raw
 * `number` (e.g. a rupee value) from being passed where paise is expected.
 * It is Zod's brand, so schema fields declared `.brand<"Paise">()`
 * (schema.ts) parse straight to `Paise`.
 */
import type { z } from "zod";

export type Paise = number & z.$brand<"Paise">;

/** Brands an integer as `Paise`. Throws if `n` is not an integer. */
export function paise(n: number): Paise {
  if (!Number.isInteger(n)) {
    throw new Error(`paise() requires an integer, got ${n}`);
  }
  return n as Paise;
}

/** Paise arithmetic stays Paise (integers are closed under + and −), so
 * derived figures keep the brand without a runtime check on a render path. */
export function addPaise(a: Paise, b: Paise): Paise {
  return (a + b) as Paise;
}
export function subPaise(a: Paise, b: Paise): Paise {
  return (a - b) as Paise;
}
export const ZERO_PAISE = 0 as Paise;

const CURRENCY_PREFIX = /^(₹|rs\.?|inr)\s*/i;
const LAKH_SUFFIX = /\s*(lakhs?)\s*$/i;
const CRORE_SUFFIX = /\s*(crores?)\s*$/i;

/**
 * Parses a free-text INR amount into integer paise, or `null` if the input
 * isn't a valid, non-negative amount.
 *
 * Accepts an optional `₹` / `Rs.` / `INR` prefix, Indian (3,40,000) or
 * Western (340,000) digit grouping, and an optional `lakh(s)` / `crore(s)`
 * suffix (1 lakh = 100,000; 1 crore = 10,000,000).
 */
export function parseInr(input: string): Paise | null {
  let s = input.trim();
  if (s === "") return null;

  s = s.replace(CURRENCY_PREFIX, "").trim();

  let multiplier = 1;
  if (LAKH_SUFFIX.test(s)) {
    multiplier = 100_000;
    s = s.replace(LAKH_SUFFIX, "").trim();
  } else if (CRORE_SUFFIX.test(s)) {
    multiplier = 10_000_000;
    s = s.replace(CRORE_SUFFIX, "").trim();
  }

  // Strip digit-group separators (commas), whether Indian or Western grouping.
  const normalized = s.replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  // Integer arithmetic (BigInt), so no float rounding: the amount must be a
  // whole number of paise, else it is rejected rather than silently rounded.
  const frac = match[2] ?? "";
  const scale = BigInt(10) ** BigInt(frac.length);
  const numerator = BigInt(match[1] + frac) * BigInt(multiplier) * BigInt(100);
  if (numerator % scale !== BigInt(0)) {
    return null;
  }
  const total = numerator / scale;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return paise(Number(total));
}

/** Formats paise as an Indian-grouped rupee string, e.g. `₹3,40,000.00`. */
export function formatInr(p: Paise): string {
  const rupees = p / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `₹${formatted}`;
}

const WHOLE_RUPEES = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Formats paise as whole rupees, e.g. `₹3,40,000` (queue reason chips). */
export function formatInrWhole(p: Paise): string {
  return `₹${WHOLE_RUPEES.format(Math.round(p / 100))}`;
}
