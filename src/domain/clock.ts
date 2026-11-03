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

/**
 * Every date the UI shows renders in ONE locale and ONE zone, whatever the
 * viewer's machine says: `en-IN` and `Asia/Kolkata` (the demo's ledger is an
 * Indian SME's). Date-only ISO strings are read as Kolkata midnight so the
 * calendar day never shifts.
 */
export const DISPLAY_LOCALE = "en-IN";
export const DISPLAY_TIME_ZONE = "Asia/Kolkata";

const DAY_FMT = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

const DAY_TIME_FMT = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDisplay(iso: string): number {
  return Date.parse(DATE_ONLY.test(iso) ? `${iso}T00:00:00+05:30` : iso);
}

/** `2026-10-30` → `30 Oct 2026`; `—` for an unparseable value. */
export function formatDate(iso: string): string {
  const ms = parseDisplay(iso);
  return Number.isNaN(ms) ? "—" : DAY_FMT.format(ms);
}

/** An instant → `30 Oct 2026, 03:35 pm` in Asia/Kolkata; `—` if unparseable. */
export function formatDateTime(iso: string): string {
  const ms = parseDisplay(iso);
  return Number.isNaN(ms) ? "—" : DAY_TIME_FMT.format(ms);
}

/** The demo's "today", overridable for tests/E2E via `meta.asOf`. */
export function asOf(meta?: { asOf?: string }): string {
  return meta?.asOf ?? AS_OF_DATE;
}
