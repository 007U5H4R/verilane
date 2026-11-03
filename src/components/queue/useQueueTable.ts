/**
 * The Queue's row model (TASK-9.1). Filtering is a pure pass over the ranked
 * rows (search + facets from the URL), then a stable one-column sort and
 * 25/page slicing, all derived from the same `QueueFilters`, so the URL stays
 * the single source of truth. No sort = rank order (TC-006): the input is
 * already rank-sorted and ties fall back to it.
 */
"use client";
import { useMemo } from "react";
import type { Paise } from "@/domain/money";
import { outstandingOf } from "@/domain/priority";
import type { RankItem } from "@/domain/priority";
import type { Customer, Invoice, InvoiceStatus, Payment, Priority } from "@/domain/schema";
import { ageingBucketOfPriority, type QueueFilters, type QueueSort, type SortColumn } from "./queueParams";

export const PAGE_SIZE = 25;

export interface QueueRow {
  invoice: Invoice;
  priority: Priority;
  customer: Customer | undefined;
  customerName: string;
  outstanding: Paise;
  /** 0-based position in rank order. */
  rank: number;
}

export function buildQueueRows(
  items: RankItem[],
  customers: Map<string, Customer>,
  payments: Payment[],
): QueueRow[] {
  return items.map(({ invoice, priority }, rank) => {
    const customer = customers.get(invoice.customer_id);
    return {
      invoice,
      priority,
      customer,
      customerName: customer?.name ?? invoice.customer_id,
      outstanding: outstandingOf(invoice, { payments }),
      rank,
    };
  });
}

/** Search (customer name or invoice no.) and every facet; order is kept. */
export function filterRows(rows: QueueRow[], f: QueueFilters): QueueRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (
      q !== "" &&
      !r.customerName.toLowerCase().includes(q) &&
      !(r.invoice.invoice_number ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.band.length > 0 && !f.band.includes(r.priority.band)) return false;
    if (f.status.length > 0 && !f.status.includes(r.invoice.status)) return false;
    if (f.customer.length > 0 && !f.customer.includes(r.invoice.customer_id)) return false;
    if (f.ageing.length > 0) {
      const bucket = ageingBucketOfPriority(r.priority);
      if (bucket === null || !f.ageing.includes(bucket)) return false;
    }
    return true;
  });
}

/** Each sortable column's key; `undefined` = unknown (sorts last either way). */
const SORT_KEYS: Record<SortColumn, (r: QueueRow) => string | number | undefined> = {
  // Higher = more urgent, so the default `desc` reads as rank order.
  priority: (r) => -r.rank,
  invoice_number: (r) => r.invoice.invoice_number ?? undefined,
  customer: (r) => r.customerName,
  outstanding: (r) => r.outstanding,
  days_overdue: (r) => r.priority.days_overdue ?? undefined,
  status: (r): InvoiceStatus => r.invoice.status,
  // ISO dates sort lexically; a missing due date (FS2) sorts last either way.
  due_date: (r) => r.invoice.due_date ?? undefined,
};

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Sorts by one column. Unknown values go last in both directions; ties keep
 * the input (rank) order. No sort = the input order (TC-006). Same semantics
 * as the TanStack Table sorted row model it replaced (TASK-38: the table
 * library was most of /queue's route-only JS and only sorted and sliced).
 */
export function sortRows(rows: QueueRow[], sort: QueueSort | null): QueueRow[] {
  if (!sort) return rows;
  const key = SORT_KEYS[sort.column];
  const dir = sort.desc ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, value: key(row) }))
    .sort((a, b) => {
      if (a.value === undefined || b.value === undefined) {
        if (a.value !== b.value) return a.value === undefined ? 1 : -1;
        return a.index - b.index;
      }
      const c = compareValues(a.value, b.value) * dir;
      return c !== 0 ? c : a.index - b.index;
    })
    .map((e) => e.row);
}

export interface QueueTable {
  /** The current page's rows. */
  rows: QueueRow[];
  /** Rows matching the filters, across all pages. */
  matched: number;
  pageCount: number;
  /** 1-based, clamped to `[1, pageCount]`. */
  page: number;
}

export function useQueueTable(allRows: QueueRow[], f: QueueFilters): QueueTable {
  const data = useMemo(() => filterRows(allRows, f), [allRows, f]);
  const pageCount = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const page = Math.min(f.page, pageCount);

  const sorted = useMemo(() => sortRows(data, f.sort), [data, f.sort]);
  const rows = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page]);

  return {
    rows,
    matched: data.length,
    pageCount,
    page,
  };
}
