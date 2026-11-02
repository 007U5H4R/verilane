/**
 * The Invoices register (TASK-38): every invoice, closed ones included —
 * not the ranked worklist (that is the Collections Queue). Pure helpers for
 * the `/invoices` list: row building, URL state, filter, sort, KPIs and
 * pagination. Status, band and days overdue come from the priority engine's
 * stored output; nothing here re-derives them.
 */
import { ageingBucketOfPriority, AGEING_BUCKETS, type AgeingBucket } from "@/domain/aggregates";
import { addPaise, subPaise, ZERO_PAISE, type Paise } from "@/domain/money";
import { outstandingOf, type RankItem } from "@/domain/priority";
import { InvoiceStatusSchema, type Customer, type InvoiceStatus, type Payment, type PriorityBand } from "@/domain/schema";

export { AGEING_BUCKETS, type AgeingBucket };

// --- Rows ---------------------------------------------------------------------

export interface InvoiceRow {
  id: string;
  /** `null` when the ledger row has no invoice number (FS1). */
  number: string | null;
  customerId: string;
  /** `null` when the customer id has no customer record. */
  customerName: string | null;
  issueDate: string;
  /** `null` when the ledger row has no due date (FS2). */
  dueDate: string | null;
  amount: Paise;
  /** amount − Σpayments (Data-Model: derived, never stored). */
  outstanding: Paise;
  status: InvoiceStatus;
  band: PriorityBand;
  /** Engine output: `null` = unknown (no due date), negative = not yet due. */
  daysOverdue: number | null;
  /** Gate G1: paid, written off, or nothing outstanding. */
  closed: boolean;
  ageing: AgeingBucket | null;
  /** Open (not resolved/rejected) disputes on this invoice. */
  disputeIds: string[];
}

export interface DisputeRef {
  dispute_id: string;
  invoice_id?: string;
}

export function buildRows(
  items: RankItem[],
  customers: Map<string, Customer>,
  payments: Payment[],
  openDisputes: DisputeRef[],
): InvoiceRow[] {
  const disputes = new Map<string, string[]>();
  for (const d of openDisputes) {
    if (!d.invoice_id) continue;
    const list = disputes.get(d.invoice_id) ?? [];
    list.push(d.dispute_id);
    disputes.set(d.invoice_id, list);
  }
  return items.map(({ invoice, priority }) => ({
    id: invoice.invoice_id,
    number: invoice.invoice_number,
    customerId: invoice.customer_id,
    customerName: customers.get(invoice.customer_id)?.name ?? null,
    issueDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    amount: invoice.amount_paise,
    outstanding: outstandingOf(invoice, { payments }),
    status: invoice.status,
    band: priority.band,
    daysOverdue: priority.days_overdue,
    closed: priority.band === "closed",
    ageing: ageingBucketOfPriority(priority),
    disputeIds: (disputes.get(invoice.invoice_id) ?? []).sort(),
  }));
}

// --- Display helpers ------------------------------------------------------------

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  written_off: "Written off",
  unknown: "Unknown",
};

export type OverdueState =
  | { kind: "closed"; label: string }
  | { kind: "unknown"; label: string }
  | { kind: "not_due"; label: string }
  | { kind: "overdue"; days: number; label: string };

/** Days-overdue cell. Unknown (no due date) reads "Unknown", never 0. */
export function overdueState(row: Pick<InvoiceRow, "closed" | "daysOverdue">): OverdueState {
  if (row.closed) return { kind: "closed", label: "Closed" };
  const d = row.daysOverdue;
  if (d === null) return { kind: "unknown", label: "Unknown" };
  if (d < 0) return { kind: "not_due", label: `Due in ${-d} ${-d === 1 ? "day" : "days"}` };
  if (d === 0) return { kind: "not_due", label: "Due today" };
  return { kind: "overdue", days: d, label: `${d} ${d === 1 ? "day" : "days"}` };
}

export type BalanceState =
  | { kind: "due"; amount: Paise }
  | { kind: "paid" }
  | { kind: "overpaid"; amount: Paise }
  | { kind: "written_off"; amount: Paise };

/** Balance-or-paid cell. */
export function balanceState(row: Pick<InvoiceRow, "status" | "outstanding">): BalanceState {
  if (row.status === "written_off") return { kind: "written_off", amount: row.outstanding };
  if (row.outstanding < 0) return { kind: "overpaid", amount: subPaise(ZERO_PAISE, row.outstanding) };
  if (row.outstanding === 0 || row.status === "paid") return { kind: "paid" };
  return { kind: "due", amount: row.outstanding };
}

// --- URL state ------------------------------------------------------------------

export const SORT_KEYS = ["number", "due", "amount", "overdue"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABEL: Record<SortKey, string> = {
  number: "Invoice number",
  due: "Due date",
  amount: "Amount",
  overdue: "Days overdue",
};

/** The useful-first direction a bare `sort=<key>` means. */
export const DEFAULT_DESC: Record<SortKey, boolean> = {
  number: false,
  due: false,
  amount: true,
  overdue: true,
};

export interface RegisterSort {
  key: SortKey;
  desc: boolean;
}

export interface RegisterParams {
  q: string;
  status: InvoiceStatus | null;
  ageing: AgeingBucket | null;
  customer: string | null;
  sort: RegisterSort;
  /** 1-based. */
  page: number;
}

export const DEFAULT_SORT: RegisterSort = { key: "number", desc: false };

export const DEFAULT_PARAMS: RegisterParams = {
  q: "",
  status: null,
  ageing: null,
  customer: null,
  sort: DEFAULT_SORT,
  page: 1,
};

export const PAGE_SIZE = 25;

function parseSort(raw: string | null): RegisterSort {
  if (!raw) return DEFAULT_SORT;
  const [key, dir] = raw.split(".");
  if (!(SORT_KEYS as readonly string[]).includes(key!)) return DEFAULT_SORT;
  const k = key as SortKey;
  if (dir === "asc") return { key: k, desc: false };
  if (dir === "desc") return { key: k, desc: true };
  if (dir === undefined) return { key: k, desc: DEFAULT_DESC[k] };
  return DEFAULT_SORT;
}

/** Query string → params. Unknown values fall back to the default. */
export function parseParams(sp: URLSearchParams): RegisterParams {
  const status = InvoiceStatusSchema.safeParse(sp.get("status"));
  const ageing = sp.get("ageing");
  const page = Number(sp.get("page"));
  const customer = sp.get("customer")?.trim();
  return {
    q: sp.get("q")?.trim() ?? "",
    status: status.success ? status.data : null,
    ageing: (AGEING_BUCKETS as readonly string[]).includes(ageing ?? "") ? (ageing as AgeingBucket) : null,
    customer: customer ? customer : null,
    sort: parseSort(sp.get("sort")),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Params → query string (no leading `?`), defaults omitted. Keys outside
 * the register's (e.g. the E2E `__state`) are not carried. */
export function serializeParams(p: RegisterParams): string {
  const sp = new URLSearchParams();
  if (p.q.trim()) sp.set("q", p.q.trim());
  if (p.status) sp.set("status", p.status);
  if (p.ageing) sp.set("ageing", p.ageing);
  if (p.customer) sp.set("customer", p.customer);
  if (p.sort.key !== DEFAULT_SORT.key || p.sort.desc !== DEFAULT_SORT.desc) {
    sp.set("sort", p.sort.desc === DEFAULT_DESC[p.sort.key] ? p.sort.key : `${p.sort.key}.${p.sort.desc ? "desc" : "asc"}`);
  }
  if (p.page > 1) sp.set("page", String(p.page));
  return sp.toString();
}

export function isFiltering(p: RegisterParams): boolean {
  return p.q !== "" || p.status !== null || p.ageing !== null || p.customer !== null;
}

// --- Filter & sort ----------------------------------------------------------------

export function filterRows(rows: InvoiceRow[], p: RegisterParams): InvoiceRow[] {
  const q = p.q.toLowerCase();
  return rows.filter((r) => {
    if (p.status && r.status !== p.status) return false;
    if (p.ageing && r.ageing !== p.ageing) return false;
    if (p.customer && r.customerId !== p.customer) return false;
    if (q) {
      const hay = [r.number, r.id, r.customerName, r.customerId].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortValue(r: InvoiceRow, key: SortKey): number | string | null {
  switch (key) {
    case "number":
      return r.number;
    case "due":
      return r.dueDate;
    case "amount":
      return r.amount;
    case "overdue":
      // A closed invoice has no live overdue figure; it sorts with the unknowns.
      return r.closed ? null : r.daysOverdue;
  }
}

/** Stable sort; unknown values (null) always sort last, in either direction.
 * Ties fall back to invoice id ascending so the order is total. */
export function sortRows(rows: InvoiceRow[], sort: RegisterSort): InvoiceRow[] {
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null && va !== vb) return (va < vb ? -1 : 1) * dir;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// --- KPIs ---------------------------------------------------------------------------

export interface RegisterKpis {
  total: number;
  /** Σ outstanding over invoices not closed (G1). */
  outstanding: Paise;
  openCount: number;
  overdueCount: number;
  overdueAmount: Paise;
  disputedCount: number;
  disputedAmount: Paise;
  closedCount: number;
}

export function kpis(rows: InvoiceRow[]): RegisterKpis {
  const k: RegisterKpis = {
    total: rows.length,
    outstanding: ZERO_PAISE,
    openCount: 0,
    overdueCount: 0,
    overdueAmount: ZERO_PAISE,
    disputedCount: 0,
    disputedAmount: ZERO_PAISE,
    closedCount: 0,
  };
  for (const r of rows) {
    if (r.closed) {
      k.closedCount += 1;
    } else {
      k.openCount += 1;
      k.outstanding = addPaise(k.outstanding, r.outstanding);
      if (r.daysOverdue !== null && r.daysOverdue > 0) {
        k.overdueCount += 1;
        k.overdueAmount = addPaise(k.overdueAmount, r.outstanding);
      }
    }
    if (r.disputeIds.length > 0) {
      k.disputedCount += 1;
      if (!r.closed) k.disputedAmount = addPaise(k.disputedAmount, r.outstanding);
    }
  }
  return k;
}

// --- Pagination ------------------------------------------------------------------------

export interface PageInfo {
  page: number;
  pageCount: number;
  /** 1-based, inclusive; 0/0 when empty. */
  start: number;
  end: number;
  total: number;
}

/** Clamps `page` into range and gives the "Showing X–Y of N" figures. */
export function pageInfo(total: number, page: number, size = PAGE_SIZE): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pageCount);
  if (total === 0) return { page: 1, pageCount: 1, start: 0, end: 0, total: 0 };
  return { page: p, pageCount, start: (p - 1) * size + 1, end: Math.min(p * size, total), total };
}

/** Page buttons with gaps, e.g. 1 … 4 5 6 … 10. */
export function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const keep = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => keep.add(n));
  const nums = [...keep].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1]! > 1) out.push("…");
    out.push(n);
  });
  return out;
}
