/**
 * The Queue's row model (TASK-9.1). Filtering is a pure pass over the ranked
 * rows (search + facets from the URL); TanStack Table then sorts and pages
 * them (25/page) with its state derived from the same `QueueFilters`, so the
 * URL stays the single source of truth. No sort = rank order (TC-006): the
 * input is already rank-sorted and TanStack's sort falls back to row index.
 */
"use client";
import { useMemo } from "react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type Row,
} from "@tanstack/react-table";
import type { Paise } from "@/domain/money";
import { outstandingOf } from "@/domain/priority";
import type { RankItem } from "@/domain/priority";
import type { Customer, Invoice, InvoiceStatus, Payment, Priority } from "@/domain/schema";
import { ageingBucketOfPriority, type QueueFilters } from "./queueParams";

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

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

type F = typeof features;

function compareValues<T extends string | number>(a: T, b: T): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function byValue(rowA: Row<F, QueueRow>, rowB: Row<F, QueueRow>, columnId: string): number {
  return compareValues(rowA.getValue<string | number>(columnId), rowB.getValue<string | number>(columnId));
}

const helper = createColumnHelper<F, QueueRow>();

const columns = helper.columns([
  // Higher = more urgent, so the default `desc` reads as rank order.
  helper.accessor((r) => -r.rank, { id: "priority", sortFn: byValue }),
  helper.accessor((r) => r.invoice.invoice_number ?? undefined, {
    id: "invoice_number",
    sortFn: byValue,
    sortUndefined: "last",
  }),
  helper.accessor((r) => r.customerName, { id: "customer", sortFn: byValue }),
  helper.accessor((r) => r.outstanding, { id: "outstanding", sortFn: byValue }),
  helper.accessor((r) => r.priority.days_overdue ?? undefined, {
    id: "days_overdue",
    sortFn: byValue,
    sortUndefined: "last",
  }),
  helper.accessor((r): InvoiceStatus => r.invoice.status, { id: "status", sortFn: byValue }),
]);

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

  const sorting = useMemo(() => (f.sort ? [{ id: f.sort.column, desc: f.sort.desc }] : []), [f.sort]);
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: PAGE_SIZE }), [page]);

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting, pagination },
    autoResetPageIndex: false,
  });

  return {
    rows: table.getRowModel().rows.map((r) => r.original),
    matched: data.length,
    pageCount,
    page,
  };
}
