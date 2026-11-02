/**
 * Queue view state ⇄ URL (TASK-9.2, TC-017). Filters, sort and page live in
 * the query string so a reload, a shared link or Back restores the view.
 * Keys, in order: `q, band, status, customer, ageing, sort, page`. Defaults
 * are omitted, list values are comma-joined, unknown values are dropped.
 */
import { AGEING_BUCKETS, type AgeingBucket } from "@/domain/aggregates";
import {
  InvoiceStatusSchema,
  PriorityBandSchema,
  type InvoiceStatus,
  type PriorityBand,
} from "@/domain/schema";

// Ageing buckets have one definition, in the domain (T18-6).
export { AGEING_BUCKETS, ageingBucketOf, ageingBucketOfPriority, type AgeingBucket } from "@/domain/aggregates";

export const SORT_COLUMNS = [
  "priority",
  "invoice_number",
  "customer",
  "outstanding",
  "days_overdue",
  "status",
  "due_date",
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

/** The direction a bare `sort=<column>` means — the useful-first order. */
export const DEFAULT_SORT_DESC: Record<SortColumn, boolean> = {
  priority: true,
  invoice_number: false,
  customer: false,
  outstanding: true,
  days_overdue: true,
  status: false,
  // Oldest due date first: the longest-standing invoices lead.
  due_date: false,
};

export interface QueueSort {
  column: SortColumn;
  desc: boolean;
}

export interface QueueFilters {
  q: string;
  band: PriorityBand[];
  status: InvoiceStatus[];
  customer: string[];
  ageing: AgeingBucket[];
  /** `null` = rank order (TC-006). */
  sort: QueueSort | null;
  /** 1-based. */
  page: number;
}

export const DEFAULT_FILTERS: QueueFilters = {
  q: "",
  band: [],
  status: [],
  customer: [],
  ageing: [],
  sort: null,
  page: 1,
};

function list(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return [...new Set(raw.split(",").filter((v) => v !== ""))];
}

function oneOf<T extends string>(allowed: readonly T[]) {
  return (v: string): v is T => (allowed as readonly string[]).includes(v);
}

function parseSort(raw: string | null): QueueSort | null {
  if (!raw) return null;
  const [column, dir, ...rest] = raw.split(".");
  if (rest.length > 0 || column === undefined || !oneOf(SORT_COLUMNS)(column)) return null;
  if (dir === undefined) return { column, desc: DEFAULT_SORT_DESC[column] };
  if (dir === "asc") return { column, desc: false };
  if (dir === "desc") return { column, desc: true };
  return null;
}

export function parse(params: URLSearchParams): QueueFilters {
  const page = Number(params.get("page"));
  return {
    q: params.get("q") ?? "",
    band: list(params, "band").filter(oneOf(PriorityBandSchema.options)),
    status: list(params, "status").filter(oneOf(InvoiceStatusSchema.options)),
    customer: list(params, "customer"),
    ageing: list(params, "ageing").filter(oneOf(AGEING_BUCKETS)),
    sort: parseSort(params.get("sort")),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function serialize(f: QueueFilters): string {
  const params = new URLSearchParams();
  if (f.q !== "") params.set("q", f.q);
  if (f.band.length > 0) params.set("band", f.band.join(","));
  if (f.status.length > 0) params.set("status", f.status.join(","));
  if (f.customer.length > 0) params.set("customer", f.customer.join(","));
  if (f.ageing.length > 0) params.set("ageing", f.ageing.join(","));
  if (f.sort) {
    const { column, desc } = f.sort;
    params.set("sort", desc === DEFAULT_SORT_DESC[column] ? column : `${column}.${desc ? "desc" : "asc"}`);
  }
  if (f.page > 1) params.set("page", String(f.page));
  // Commas are safe in a query string; keep them readable in shared links.
  return params.toString().replaceAll("%2C", ",");
}

/** Search + each facet with a value (sort and page are not filters). */
export function activeFilterCount(f: QueueFilters): number {
  return (
    (f.q.trim() !== "" ? 1 : 0) +
    (f.band.length > 0 ? 1 : 0) +
    (f.status.length > 0 ? 1 : 0) +
    (f.customer.length > 0 ? 1 : 0) +
    (f.ageing.length > 0 ? 1 : 0)
  );
}
