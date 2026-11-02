/**
 * Pure list helpers for the payments page: search, filters, sorts,
 * pagination, ledger totals and CSV export. No React, no store.
 */
import type { Paise } from "../money";
import type { LedgerStatus } from "./reconcile";

/* ---------- amount buckets ---------- */

const RUPEE = 100;
export const AMOUNT_BUCKETS = [
  { id: "all", label: "All amounts" },
  { id: "lt50k", label: "< ₹50,000" },
  { id: "50k-1l", label: "₹50,000 – ₹1,00,000" },
  { id: "1l-5l", label: "₹1,00,000 – ₹5,00,000" },
  { id: "gt5l", label: "> ₹5,00,000" },
] as const;
export type AmountBucket = (typeof AMOUNT_BUCKETS)[number]["id"];

export function isAmountBucket(v: unknown): v is AmountBucket {
  return AMOUNT_BUCKETS.some((b) => b.id === v);
}

/** Bounds are inclusive at the top so each edge lands in exactly one bucket. An unknown amount is only in "all". */
export function inBucket(amount: Paise | undefined, bucket: AmountBucket): boolean {
  if (bucket === "all") return true;
  if (amount === undefined) return false;
  const a = amount as number;
  switch (bucket) {
    case "lt50k":
      return a < 50_000 * RUPEE;
    case "50k-1l":
      return a >= 50_000 * RUPEE && a <= 1_00_000 * RUPEE;
    case "1l-5l":
      return a > 1_00_000 * RUPEE && a <= 5_00_000 * RUPEE;
    case "gt5l":
      return a > 5_00_000 * RUPEE;
  }
}

/* ---------- reconciliation cases ---------- */

export interface CaseRow {
  id: string;
  sentAt: string;
  amount: Paise | undefined;
  discrepancy: Paise | undefined;
  customerId: string | undefined;
  /** Text the search box matches: email id, sender, invoice numbers, customer name. */
  haystack: string[];
}

export interface CaseFilter {
  q?: string;
  customerId?: string;
  bucket?: AmountBucket;
}

const matchesQuery = (haystack: string[], q: string | undefined): boolean => {
  const needle = (q ?? "").trim().toLowerCase();
  if (!needle) return true;
  return haystack.some((h) => h.toLowerCase().includes(needle));
};

export function filterCases<T extends CaseRow>(rows: T[], f: CaseFilter): T[] {
  return rows.filter(
    (r) =>
      matchesQuery(r.haystack, f.q) &&
      (!f.customerId || r.customerId === f.customerId) &&
      inBucket(r.amount, f.bucket ?? "all"),
  );
}

export const CASE_SORTS = [
  { id: "latest", label: "Latest" },
  { id: "oldest", label: "Oldest" },
  { id: "amount_desc", label: "Highest amount" },
  { id: "amount_asc", label: "Lowest amount" },
  { id: "discrepancy", label: "Highest discrepancy" },
] as const;
export type CaseSort = (typeof CASE_SORTS)[number]["id"];

export function isCaseSort(v: unknown): v is CaseSort {
  return CASE_SORTS.some((s) => s.id === v);
}

/** Unknown values sort last in every numeric order; ties keep input order (stable sort). */
const byNumber = (a: number | undefined, b: number | undefined, dir: 1 | -1): number => {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return (a - b) * dir;
};

export function sortCases<T extends CaseRow>(rows: T[], sort: CaseSort): T[] {
  const out = [...rows];
  switch (sort) {
    case "latest":
      return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    case "oldest":
      return out.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    case "amount_desc":
      return out.sort((a, b) => byNumber(a.amount, b.amount, -1));
    case "amount_asc":
      return out.sort((a, b) => byNumber(a.amount, b.amount, 1));
    case "discrepancy":
      return out.sort((a, b) => byNumber(a.discrepancy, b.discrepancy, -1));
  }
}

/* ---------- pagination ---------- */

export interface Page<T> {
  items: T[];
  from: number;
  to: number;
  total: number;
  page: number;
  pages: number;
}

export function paginate<T>(items: T[], page: number, size: number): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
    page: p,
    pages,
  };
}

export function showingText(p: Pick<Page<unknown>, "from" | "to" | "total">): string {
  return p.total === 0 ? "Showing 0 of 0" : `Showing ${p.from}–${p.to} of ${p.total}`;
}

/* ---------- ledger ---------- */

export interface LedgerListRow {
  id: string;
  paidOn: string;
  amount: Paise;
  customerId: string | undefined;
  status: LedgerStatus;
  haystack: string[];
}

export interface LedgerFilter {
  q?: string;
  customerId?: string;
  status?: LedgerStatus;
}

export function filterLedger<T extends LedgerListRow>(rows: T[], f: LedgerFilter): T[] {
  return rows.filter(
    (r) =>
      matchesQuery(r.haystack, f.q) &&
      (!f.customerId || r.customerId === f.customerId) &&
      (!f.status || r.status === f.status),
  );
}

export const LEDGER_SORTS = [
  { id: "latest", label: "Latest" },
  { id: "oldest", label: "Oldest" },
  { id: "amount_desc", label: "Highest amount" },
  { id: "amount_asc", label: "Lowest amount" },
] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number]["id"];

export function isLedgerSort(v: unknown): v is LedgerSort {
  return LEDGER_SORTS.some((s) => s.id === v);
}

export function sortLedger<T extends LedgerListRow>(rows: T[], sort: LedgerSort): T[] {
  const out = [...rows];
  switch (sort) {
    case "latest":
      return out.sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id.localeCompare(a.id));
    case "oldest":
      return out.sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.id.localeCompare(b.id));
    case "amount_desc":
      return out.sort((a, b) => (b.amount as number) - (a.amount as number));
    case "amount_asc":
      return out.sort((a, b) => (a.amount as number) - (b.amount as number));
  }
}

const uniqueSum = (rows: LedgerListRow[]): { sum: number; count: number } => {
  const seen = new Map<string, number>();
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r.amount as number);
  let sum = 0;
  for (const v of seen.values()) sum += v;
  return { sum, count: seen.size };
};

/** The filtered (displayed) total and the whole-ledger total, each counting a payment id once. */
export function ledgerTotals(
  displayed: LedgerListRow[],
  all: LedgerListRow[],
): { displayed: number; displayedCount: number; full: number; fullCount: number } {
  const d = uniqueSum(displayed);
  const f = uniqueSum(all);
  return { displayed: d.sum, displayedCount: d.count, full: f.sum, fullCount: f.count };
}

/* ---------- CSV ---------- */

/** Escape one cell; a leading = + - @ is prefixed with ' so spreadsheets never evaluate it. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
