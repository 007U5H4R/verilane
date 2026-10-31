/**
 * The demo is frozen at a fixed "today" so every computed priority, days-
 * overdue figure, and evidence line is reproducible across runs.
 */
export const AS_OF_DATE = "2026-10-30";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Converts an ISO date(-time) string to a whole-day count since the epoch. */
export function toDay(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`toDay() received an invalid date: ${iso}`);
  }
  return Math.floor(ms / MS_PER_DAY);
}

/** Whole calendar days from `a` to `b` (negative if `b` is before `a`). */
export function daysBetween(a: string, b: string): number {
  return toDay(b) - toDay(a);
}

/** The demo's "today", overridable for tests/E2E via `meta.asOf`. */
export function asOf(meta?: { asOf?: string }): string {
  return meta?.asOf ?? AS_OF_DATE;
}
