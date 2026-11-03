/**
 * Email Conversations view state ⇄ URL, and the filter / sort / KPI /
 * pagination helpers over `EmailThread`s (TASK-38). Keys, in order:
 * `q, customer, intent, outcome, linked, sort, page, thread`. Defaults are
 * omitted and unknown values dropped, so a shared link restores the view.
 */
import { EmailClassSchema, MatchOutcomeSchema, type EmailClass, type MatchOutcome } from "@/domain/schema";
import type { EmailThread } from "./threads";

/** An extraction class, or "rejected" for threads with a rejected extraction. */
export type IntentFilter = EmailClass | "rejected";
export const INTENT_FILTERS: readonly IntentFilter[] = [...EmailClassSchema.options, "rejected"];

export const LINKED_FILTERS = ["invoice", "dispute", "review", "unlinked"] as const;
export type LinkedFilter = (typeof LINKED_FILTERS)[number];

export const SORTS = ["latest", "oldest"] as const;
export type EmailSort = (typeof SORTS)[number];

export interface EmailFilters {
  q: string;
  /** customer_id */
  customer: string | null;
  intent: IntentFilter | null;
  outcome: MatchOutcome | null;
  linked: LinkedFilter | null;
  sort: EmailSort;
  /** 1-based. */
  page: number;
  /** Selected thread_id. */
  thread: string | null;
}

export const DEFAULT_FILTERS: EmailFilters = {
  q: "",
  customer: null,
  intent: null,
  outcome: null,
  linked: null,
  sort: "latest",
  page: 1,
  thread: null,
};

function oneOf<T extends string>(allowed: readonly T[], v: string | null): T | null {
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function parseFilters(params: URLSearchParams): EmailFilters {
  const page = Number(params.get("page"));
  return {
    q: params.get("q") ?? "",
    customer: params.get("customer") || null,
    intent: oneOf(INTENT_FILTERS, params.get("intent")),
    outcome: oneOf(MatchOutcomeSchema.options, params.get("outcome")),
    linked: oneOf(LINKED_FILTERS, params.get("linked")),
    sort: oneOf(SORTS, params.get("sort")) ?? "latest",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    thread: params.get("thread") || null,
  };
}

export function serializeFilters(f: EmailFilters): string {
  const params = new URLSearchParams();
  if (f.q !== "") params.set("q", f.q);
  if (f.customer) params.set("customer", f.customer);
  if (f.intent) params.set("intent", f.intent);
  if (f.outcome) params.set("outcome", f.outcome);
  if (f.linked) params.set("linked", f.linked);
  if (f.sort !== "latest") params.set("sort", f.sort);
  if (f.page > 1) params.set("page", String(f.page));
  if (f.thread) params.set("thread", f.thread);
  return params.toString();
}

/** Search + each facet with a value (sort, page and the selection are not filters). */
export function activeFilterCount(f: EmailFilters): number {
  return (
    (f.q.trim() !== "" ? 1 : 0) +
    (f.customer ? 1 : 0) +
    (f.intent ? 1 : 0) +
    (f.outcome ? 1 : 0) +
    (f.linked ? 1 : 0)
  );
}

/** Case-insensitive search over customer, subject, invoice numbers and ids, sender and thread id. */
export function matchesQuery(t: EmailThread, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    t.thread_id,
    t.subject,
    t.customerName ?? "",
    t.customer_id ?? "",
    ...t.messages.map((m) => m.email.from_address),
    ...t.refs,
    ...t.invoices.flatMap((i) => [i.label, i.invoice_id]),
    ...t.candidates.flatMap((i) => [i.label, i.invoice_id]),
  ];
  return hay.some((s) => s.toLowerCase().includes(needle));
}

export function matchesLinked(t: EmailThread, linked: LinkedFilter): boolean {
  switch (linked) {
    case "invoice":
      return t.invoices.length > 0;
    case "dispute":
      return t.disputes.length > 0;
    case "review":
      return t.openReviews.length > 0;
    case "unlinked":
      return t.invoices.length === 0;
  }
}

export function filterThreads(threads: EmailThread[], f: EmailFilters): EmailThread[] {
  return threads.filter(
    (t) =>
      matchesQuery(t, f.q) &&
      (!f.customer || t.customer_id === f.customer) &&
      (!f.intent || (f.intent === "rejected" ? t.rejected > 0 : t.intents.includes(f.intent))) &&
      (!f.outcome || t.outcomes.includes(f.outcome)) &&
      (!f.linked || matchesLinked(t, f.linked)),
  );
}

export function sortThreads(threads: EmailThread[], sort: EmailSort): EmailThread[] {
  const dir = sort === "latest" ? -1 : 1;
  return [...threads].sort(
    (a, b) => dir * a.lastSentAt.localeCompare(b.lastSentAt) || a.thread_id.localeCompare(b.thread_id),
  );
}

export interface EmailKpis {
  threads: number;
  messages: number;
  customers: number;
  needsReview: number;
  linkedToDispute: number;
  rejected: number;
}

/** Counts over all threads (not the filtered view). `rejected` counts messages; the rest count threads. */
export function kpisFor(threads: EmailThread[]): EmailKpis {
  return {
    threads: threads.length,
    messages: threads.reduce((n, t) => n + t.messages.length, 0),
    customers: new Set(threads.flatMap((t) => (t.customer_id ? [t.customer_id] : []))).size,
    needsReview: threads.filter((t) => t.openReviews.length > 0).length,
    linkedToDispute: threads.filter((t) => t.disputes.length > 0).length,
    rejected: threads.reduce((n, t) => n + t.rejected, 0),
  };
}

export const PAGE_SIZE = 10;

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: p, pageCount, from: total === 0 ? 0 : start + 1, to: start + slice.length, total };
}
