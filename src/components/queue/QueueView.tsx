"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Button } from "@/components/ui/button";
import { InvoiceStatusSchema, PriorityBandSchema } from "@/domain/schema";
import type { VerilaneDb } from "@/store/db";
import { formatDate } from "@/domain/clock";
import { resetDemo } from "@/store/dataCommands";
import { DbContext, useAsOf, useCustomers, usePayments, useQueue } from "@/store/hooks";
import { applyUpdate, initIntent, onUrl } from "./filterIntent";
import { FiltersPanel, type ApplyFilters } from "./FiltersPanel";
import { DEFAULT_FILTERS, DEFAULT_SORT_DESC, SORT_COLUMNS, parse, type QueueFilters, type SortColumn } from "./queueParams";
import { RowCard } from "./RowCard";
import { buildQueueRows, useQueueTable } from "./useQueueTable";

const SORT_LABELS: Record<SortColumn, string> = {
  priority: "Priority",
  invoice_number: "Invoice no.",
  customer: "Customer",
  outstanding: "Outstanding",
  days_overdue: "Days overdue",
  status: "Status",
};

/**
 * The Queue (TASK-9): rank-ordered rows with search, facets, sort and
 * 25-row pages, all held in the URL (TC-017), plus the four screen states
 * (TC-016). Must render inside <Suspense> (it reads search params).
 */
export function QueueView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  const asOf = useAsOf();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;

  let body;
  if (forced === "loading") body = <RowSkeleton label="Loading queue" />;
  else if (forced === "empty") body = <NoData db={db} />;
  else if (forced === "error" || !db) body = <QueueError />;
  else body = <QueueBody db={db} params={params.toString()} />;

  return (
    <section className="flex flex-col gap-4 p-4 md:p-7" aria-labelledby="queue-title">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 id="queue-title" className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
            Collections queue
          </h1>
          <p className="text-text-muted">Ranked by priority.v1 · as of {formatDate(asOf)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings#import">Import data</Link>
        </Button>
      </header>
      {body}
    </section>
  );
}

/** The db failed to open/seed; a reload re-runs the provider's load. */
function QueueError() {
  return <ErrorState message="Couldn’t load the queue." onRetry={() => window.location.reload()} />;
}

function NoData({ db }: { db: VerilaneDb | null }) {
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!db || busy) return;
    setBusy(true);
    try {
      // R5: through the audited reset_demo command, never a raw load.
      await resetDemo(db);
    } catch {
      toast.error("Couldn’t load the demo data. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <EmptyState
      title="No invoices yet"
      state="empty"
      action={
        <Button size="sm" onClick={load} disabled={!db || busy}>
          Load demo data
        </Button>
      }
    >
      Load the demo set or import your own CSV. Imported data stays in this browser.
    </EmptyState>
  );
}

function QueueBody({ db, params }: { db: VerilaneDb; params: string }) {
  const router = useRouter();
  const items = useQueue();
  const customers = useCustomers();
  const payments = usePayments();

  const filters = useMemo(() => parse(new URLSearchParams(params)), [params]);
  const allRows = useMemo(
    () => (items && customers && payments ? buildQueueRows(items, customers, payments) : undefined),
    [items, customers, payments],
  );
  const table = useQueueTable(allRows ?? [], filters);

  // Latest requested filters; the URL lags router.push (fix round 1).
  const intent = useRef(initIntent(filters));
  useEffect(() => {
    intent.current = onUrl(intent.current, filters);
  }, [filters]);

  const apply = useCallback<ApplyFilters>(
    (update, mode) => {
      const { state, qs } = applyUpdate(intent.current, update);
      intent.current = state;
      const url = qs ? `/queue?${qs}` : "/queue";
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router],
  );

  const facets = useMemo(() => {
    const rows = allRows ?? [];
    const bands = new Set([...rows.map((r) => r.priority.band), ...filters.band]);
    const statuses = new Set([...rows.map((r) => r.invoice.status), ...filters.status]);
    return {
      bands: PriorityBandSchema.options.filter((b) => bands.has(b)),
      statuses: InvoiceStatusSchema.options.filter((s) => statuses.has(s)),
      customers: [...(customers?.values() ?? [])]
        .map((c) => ({ id: c.customer_id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [allRows, customers, filters.band, filters.status]);

  if (!allRows) return <RowSkeleton label="Loading queue" />;
  if (allRows.length === 0) return <NoData db={db} />;

  return (
    <div className="flex flex-col gap-4" data-state="working">
      <FiltersPanel
        filters={filters}
        apply={apply}
        matched={table.matched}
        total={allRows.length}
        {...facets}
      />
      <SortControl filters={filters} apply={apply} />
      {table.matched === 0 ? (
        <EmptyState
          title="No invoices match these filters"
          state="empty-filtered"
          action={
            <Button variant="outline" size="sm" onClick={() => apply((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort }), "push")}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col rounded-lg border border-border bg-surface" aria-label="Invoices">
            {table.rows.map((r) => (
              <RowCard
                key={r.invoice.invoice_id}
                invoice={r.invoice}
                priority={r.priority}
                customer={r.customer}
                payments={payments ?? []}
              />
            ))}
          </div>
          <nav aria-label="Pages" className="flex items-center justify-end gap-2 text-[13px] text-text-muted">
            <span data-testid="page-indicator">
              Page {table.page} of {table.pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={table.page <= 1}
              onClick={() => apply((prev) => ({ ...prev, page: table.page - 1 }), "push")}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={table.page >= table.pageCount}
              onClick={() => apply((prev) => ({ ...prev, page: table.page + 1 }), "push")}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

/** Sort picker: "Priority" = rank order (no `sort` in the URL, TC-006). */
function SortControl({ filters, apply }: { filters: QueueFilters; apply: ApplyFilters }) {
  const sort = filters.sort;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
      <label className="flex items-center gap-2">
        Sort by
        <select
          value={sort?.column ?? "priority"}
          onChange={(e) => {
            const column = e.target.value as SortColumn;
            const next = column === "priority" ? null : { column, desc: DEFAULT_SORT_DESC[column] };
            apply((prev) => ({ ...prev, sort: next, page: 1 }), "push");
          }}
          className="min-h-9 rounded-md border border-border bg-surface px-2 text-text"
        >
          {SORT_COLUMNS.map((c) => (
            <option key={c} value={c}>
              {SORT_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      {sort && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Sort direction: ${sort.desc ? "descending" : "ascending"}. Switch`}
          onClick={() => apply((prev) => ({ ...prev, sort: { ...sort, desc: !sort.desc }, page: 1 }), "push")}
        >
          {sort.desc ? "Descending" : "Ascending"}
        </Button>
      )}
    </div>
  );
}
