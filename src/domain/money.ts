/**
 * Money is always paise (1 rupee = 100 paise), stored as an integer, so
 * arithmetic never hits floating-point rounding. The brand prevents a raw
 * `number` (e.g. a rupee value) from being passed where paise is expected.
 */
export type Paise = number & { readonly __brand: "Paise" };

/** Brands an integer as `Paise`. Throws if `n` is not an integer. */
export function paise(n: number): Paise {
  if (!Number.isInteger(n)) {
    throw new Error(`paise() requires an integer, got ${n}`);
  }
  return n as Paise;
}

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
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const rupees = Number.parseFloat(normalized) * multiplier;
  if (!Number.isFinite(rupees) || rupees < 0) {
    return null;
  }

  return paise(Math.round(rupees * 100));
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
