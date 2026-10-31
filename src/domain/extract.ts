/**
 * Deterministic token extraction from an email body (TASK-12.1, TC-021).
 * Pure: no I/O, no clock — relative dates resolve against the message's own
 * `sent_at`, so the same message always yields the same tokens.
 *
 * Conventions (eval/CHANGELOG.md "Labelling conventions"):
 * - refs normalise to `INV-<digits>`, deduped in order of first appearance;
 * - an amount needs a currency marker (₹ / Rs / INR prefix, or a lakh /
 *   crore / rupees suffix), so UTRs, POs and invoice numbers never count;
 * - numeric dates are DD/MM[/YYYY], never MM/DD; a missing year is the sent year;
 * - "next <weekday>" is that weekday in the following Monday-start week;
 *   "last/on <weekday>" is the most recent such day before the sent date.
 */
import { parseInr, type Paise } from "./money";

export interface DateToken {
  text: string;
  iso: string;
  /** Character offset in the body — lets the classifier pick the date nearest a signal. */
  index: number;
}

export interface RelativeDateToken {
  text: string;
  resolved: string;
  index: number;
}

export interface Tokens {
  /** The message's sent date (ISO day) — the anchor for "future" / "past" dates. */
  sent: string;
  refs: string[];
  amounts: Paise[];
  /** Absolute dates written in the text. */
  dates: DateToken[];
  /** Relative phrases ("next Friday", "yesterday") resolved against `sent_at`. */
  relativeDates: RelativeDateToken[];
  /** `dates` + resolved `relativeDates`, in text order. */
  allDates: DateToken[];
}

export interface ExtractInput {
  body: string;
  sent_at: string;
}

const REF = /\bINV\s*-?\s*(\d{4})\b/gi;

const AMOUNT =
  /(?:₹|\bRs\.?|\bINR)\s*(\d[\d,]*(?:\.\d+)?(?:\s*(?:lakhs?|crores?)\b)?)|\b(\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|crores?))\b|\b(\d[\d,]*(?:\.\d+)?)\s*rupees\b/gi;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAME =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const WORD_DATE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME})\\.?(?:,?\\s+(\\d{4}))?\\b`,
  "gi",
);
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g;

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAY = WEEKDAYS.join("|");
const NUMBER_WORDS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const REL_DAY = /\b(today|yesterday|tomorrow)\b/gi;
const REL_NEXT_WEEKDAY = new RegExp(`\\bnext\\s+(${WEEKDAY})\\b`, "gi");
const REL_PAST_WEEKDAY = new RegExp(`\\b(last|on)\\s+(${WEEKDAY})\\b`, "gi");
const REL_BY_WEEKDAY = new RegExp(`\\b(?:by|this|coming)\\s+(${WEEKDAY})\\b`, "gi");
const REL_IN_N = /\bin\s+(a|one|two|three|four|five|six|\d+)\s+(days?|weeks?)\b/gi;
const REL_END_OF_MONTH = /\bend\s+of\s+(?:this|the)\s+month\b/gi;

// A future marker shortly before "on <weekday>" turns it into a promise
// ("we will pay on Friday") rather than a past event.
const FUTURE_MARKER = /\b(will|shall|going to|plan to|planning to)\b[^.;!?]*$/i;

const MS_PER_DAY = 86_400_000;

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
}

function isoOf(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
function mondayIndex(day: number): number {
  return (new Date(day * MS_PER_DAY).getUTCDay() + 6) % 7;
}

function validIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function fullYear(raw: string | undefined, sentYear: number): number {
  if (raw === undefined) return sentYear;
  return raw.length === 2 ? 2000 + Number(raw) : Number(raw);
}

/** Spans already claimed by an earlier, more specific pattern. */
class Spans {
  private taken: Array<[number, number]> = [];
  claim(start: number, end: number): boolean {
    if (this.taken.some(([s, e]) => start < e && end > s)) return false;
    this.taken.push([start, end]);
    return true;
  }
}

function extractRefs(body: string): string[] {
  const refs: string[] = [];
  for (const m of body.matchAll(REF)) {
    const ref = `INV-${m[1]}`;
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

function extractAmounts(body: string): Paise[] {
  const amounts: Paise[] = [];
  for (const m of body.matchAll(AMOUNT)) {
    const raw = m[1] ?? m[2] ?? m[3];
    if (raw === undefined) continue;
    const value = parseInr(raw);
    if (value === null || value === 0) continue;
    if (!amounts.includes(value)) amounts.push(value);
  }
  return amounts;
}

function extractDates(body: string, sentYear: number, spans: Spans): DateToken[] {
  const out: DateToken[] = [];
  const push = (m: RegExpMatchArray, iso: string | null) => {
    const index = m.index ?? 0;
    if (iso === null || !spans.claim(index, index + m[0].length)) return;
    out.push({ text: m[0], iso, index });
  };

  for (const m of body.matchAll(ISO_DATE)) {
    push(m, validIso(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  for (const m of body.matchAll(WORD_DATE)) {
    const month = MONTHS[(m[2] ?? "").slice(0, 3).toLowerCase()];
    if (month === undefined) continue;
    push(m, validIso(fullYear(m[3], sentYear), month, Number(m[1])));
  }
  for (const m of body.matchAll(NUMERIC_DATE)) {
    push(m, validIso(fullYear(m[3], sentYear), Number(m[2]), Number(m[1])));
  }
  return out.sort((a, b) => a.index - b.index);
}

function extractRelativeDates(body: string, sentIso: string, spans: Spans): RelativeDateToken[] {
  const sent = dayNumber(sentIso);
  const out: RelativeDateToken[] = [];
  const push = (m: RegExpMatchArray, day: number) => {
    const index = m.index ?? 0;
    if (!spans.claim(index, index + m[0].length)) return;
    out.push({ text: m[0], resolved: isoOf(day), index });
  };
  const weekdayIdx = (name: string | undefined) => WEEKDAYS.indexOf((name ?? "").toLowerCase());

  for (const m of body.matchAll(REL_DAY)) {
    const word = (m[1] ?? "").toLowerCase();
    push(m, sent + (word === "yesterday" ? -1 : word === "tomorrow" ? 1 : 0));
  }
  for (const m of body.matchAll(REL_NEXT_WEEKDAY)) {
    const nextWeekMonday = sent - mondayIndex(sent) + 7;
    push(m, nextWeekMonday + weekdayIdx(m[1]));
  }
  for (const m of body.matchAll(REL_PAST_WEEKDAY)) {
    const target = weekdayIdx(m[2]);
    const before = body.slice(0, m.index ?? 0);
    const future = (m[1] ?? "").toLowerCase() === "on" && FUTURE_MARKER.test(before);
    if (future) {
      const ahead = (target - mondayIndex(sent) + 7) % 7 || 7;
      push(m, sent + ahead);
    } else {
      const back = (mondayIndex(sent) - target + 7) % 7 || 7;
      push(m, sent - back);
    }
  }
  for (const m of body.matchAll(REL_BY_WEEKDAY)) {
    const ahead = (weekdayIdx(m[1]) - mondayIndex(sent) + 7) % 7 || 7;
    push(m, sent + ahead);
  }
  for (const m of body.matchAll(REL_IN_N)) {
    const rawN = (m[1] ?? "").toLowerCase();
    const n = NUMBER_WORDS[rawN] ?? Number(rawN);
    const unit = (m[2] ?? "").toLowerCase().startsWith("week") ? 7 : 1;
    push(m, sent + n * unit);
  }
  for (const m of body.matchAll(REL_END_OF_MONTH)) {
    const [y, mo] = sentIso.split("-").map(Number);
    push(m, Date.UTC(y ?? 1970, mo ?? 1, 0) / MS_PER_DAY);
  }
  return out.sort((a, b) => a.index - b.index);
}

export function extractTokens(msg: ExtractInput): Tokens {
  const sentIso = msg.sent_at.slice(0, 10);
  const sentYear = Number(sentIso.slice(0, 4));
  const spans = new Spans();
  const dates = extractDates(msg.body, sentYear, spans);
  const relativeDates = extractRelativeDates(msg.body, sentIso, spans);
  const allDates = [
    ...dates,
    ...relativeDates.map((r) => ({ text: r.text, iso: r.resolved, index: r.index })),
  ].sort((a, b) => a.index - b.index);
  return {
    sent: sentIso,
    refs: extractRefs(msg.body),
    amounts: extractAmounts(msg.body),
    dates,
    relativeDates,
    allDates,
  };
}
