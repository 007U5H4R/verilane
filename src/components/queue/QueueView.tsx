"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Rows3, Table2, Upload } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Button } from "@/components/ui/button";
import { InvoiceStatusSchema, PriorityBandSchema } from "@/domain/schema";
import type { VerilaneDb } from "@/store/db";
import { formatDate } from "@/domain/clock";
import { DbContext, useAsOf, useCustomers, usePayments, useQueue } from "@/store/hooks";
import { cn } from "@/lib/cn";
import { applyUpdate, initIntent, onUrl } from "./filterIntent";
import { FiltersPanel, type ApplyFilters } from "./FiltersPanel";
import { pageWindow, queueKpis, showingRange } from "./queueActions";
import { QueueKpis } from "./QueueKpis";
import { DEFAULT_FILTERS, DEFAULT_SORT_DESC, SORT_COLUMNS, parse, type QueueFilters, type SortColumn } from "./queueParams";
import { QueueTable, type Density } from "./QueueTable";
import { PAGE_SIZE, buildQueueRows, useQueueTable, type QueueRow } from "./useQueueTable";

/** Brief order first (TASK-38); invoice no. and status stay reachable (URLs and specs use them). */
const SORT_LABELS: Record<SortColumn, string> = {
  priority: "Priority",
  days_overdue: "Days overdue",
  outstanding: "Outstanding",
  due_date: "Due date (oldest)",
  customer: "Customer A–Z",
  invoice_number: "Invoice no.",
  status: "Status",
};
const SORT_ORDER = (Object.keys(SORT_LABELS) as SortColumn[]).filter((c) => SORT_COLUMNS.includes(c));

// Dialogs (and the alert-dialog primitive) load on demand: keeps /queue under its
// 300 KB first-load budget. They mount only while open.
const ReminderDialog = dynamic(() => import("./DraftDialogs").then((m) => m.ReminderDialog), { ssr: false });
const CreateDraftDialog = dynamic(() => import("./DraftDialogs").then((m) => m.CreateDraftDialog), { ssr: false });

/**
 * The Collections Queue (TASK-9, redesigned TASK-38): KPI cards, search and
 * facets, a ranked table with selection, sort and numbered pages — filters,
 * sort and page all held in the URL (TC-017) — plus the four screen states
 * (TC-016). Must render inside <Suspense> (it reads search params).
 */
export function QueueView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;

  if (forced === "loading") return <Frame><RowSkeleton label="Loading queue" /></Frame>;
  if (forced === "empty") return <Frame><NoData db={db} /></Frame>;
  if (forced === "error" || !db) return <Frame><QueueError /></Frame>;
  return <QueueBody db={db} params={params.toString()} />;
}

/** Page frame + header. The shell owns the breadcrumb; the header starts at the H1. */
function Frame({ action, children }: { action?: ReactNode; children: ReactNode }) {
  const asOf = useAsOf();
  return (
    <section className="flex min-w-0 flex-col gap-5 p-4 md:p-7" aria-labelledby="queue-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            id="queue-title"
            className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text md:text-[32px]"
          >
            Collections Queue
          </h1>
          {/* Kept verbatim: names the ranking model and the as-of date (settings.spec reads it). */}
          <p className="text-sm text-text-muted">Ranked by priority.v1 · as of {formatDate(asOf)}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings#import">
              <Upload aria-hidden className="size-4" />
              Import data
            </Link>
          </Button>
          {action}
        </div>
      </header>
      {children}
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
      // TASK-40: loaded on use, so the reset path stays out of the first load.
      const { resetDemo } = await import("@/store/dataCommands");
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

  const kpis = useMemo(() => queueKpis(allRows ?? []), [allRows]);

  // Selection is view state (not in the URL): invoice ids, kept across pages
  // and filters; ids no longer in the queue simply drop out of `selectedRows`.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectedRows = useMemo(
    () => (allRows ?? []).filter((r) => selectedIds.has(r.invoice.invoice_id)),
    [allRows, selectedIds],
  );
  const [density, setDensity] = useState<Density>("table");
  const [reminderRow, setReminderRow] = useState<QueueRow | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback((ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const count = selectedRows.length;
  const createDraft = (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        disabled={count === 0}
        aria-describedby="create-draft-hint"
        onClick={() => setBatchOpen(true)}
      >
        <Plus aria-hidden className="size-4" />
        Create draft
      </Button>
      <p id="create-draft-hint" className="text-xs text-text-muted">
        {count === 0 ? "Select invoices to draft reminders" : `${count} selected · nothing is sent`}
      </p>
    </div>
  );

  if (!allRows) return <Frame action={createDraft}><RowSkeleton label="Loading queue" /></Frame>;
  if (allRows.length === 0) return <Frame action={createDraft}><NoData db={db} /></Frame>;

  const range = showingRange(table.page, PAGE_SIZE, table.matched);

  return (
    <Frame action={createDraft}>
      <div className="flex min-w-0 flex-col gap-4" data-state="working">
        <QueueKpis kpis={kpis} band={filters.band} apply={apply} />
        <FiltersPanel filters={filters} apply={apply} matched={table.matched} total={allRows.length} {...facets} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="font-medium tabular-nums text-text">
              {table.matched} {table.matched === 1 ? "invoice" : "invoices"}
            </p>
            {count > 0 && (
              <>
                <span className="tabular-nums text-text-muted">{count} selected</span>
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                  Clear selection
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SortControl filters={filters} apply={apply} />
            <DensityToggle value={density} onChange={setDensity} />
          </div>
        </div>
        {table.matched === 0 ? (
          <EmptyState
            title="No invoices match these filters"
            state="empty-filtered"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => apply((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort }), "push")}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <QueueTable
              rows={table.rows}
              density={density}
              selected={selectedIds}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onReminder={setReminderRow}
            />
            <Pagination
              page={table.page}
              pageCount={table.pageCount}
              from={range.from}
              to={range.to}
              matched={table.matched}
              go={(p) => apply((prev) => ({ ...prev, page: p }), "push")}
            />
          </>
        )}
      </div>
      {reminderRow && <ReminderDialog db={db} row={reminderRow} onClose={() => setReminderRow(null)} />}
      {batchOpen && (
        <CreateDraftDialog
          db={db}
          rows={selectedRows}
          open={batchOpen}
          onOpenChange={setBatchOpen}
          onDone={clearSelection}
        />
      )}
    </Frame>
  );
}

function Pagination({
  page,
  pageCount,
  from,
  to,
  matched,
  go,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  matched: number;
  go: (page: number) => void;
}) {
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-text-muted">
      <p className="tabular-nums">
        Showing {from}–{to} of {matched} <span aria-hidden="true">·</span>{" "}
        <span data-testid="page-indicator">
          Page {page} of {pageCount}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Button>
        {pageWindow(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} aria-hidden="true" className="px-1">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant="outline"
              size="sm"
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              disabled={p === page}
              onClick={() => go(p)}
              className={cn(
                "min-w-9 tabular-nums",
                p === page && "border-brand bg-brand text-on-brand disabled:opacity-100",
              )}
            >
              {p}
            </Button>
          ),
        )}
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => go(page + 1)}>
          Next
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

const DENSITIES: { value: Density; label: string; icon: typeof Table2 }[] = [
  { value: "table", label: "Table", icon: Table2 },
  { value: "compact", label: "Compact", icon: Rows3 },
];

/** Table / Compact row density: a radio group (arrow keys switch, roving tabindex). */
function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const i = DENSITIES.findIndex((o) => o.value === value);
    const n = (i + 1) % DENSITIES.length;
    onChange(DENSITIES[n]!.value);
    refs.current[n]?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label="Row density"
      onKeyDown={onKey}
      className="flex rounded-md border border-border bg-surface p-0.5"
    >
      {DENSITIES.map((o, i) => {
        const checked = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-8 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium max-md:min-h-11",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive",
              checked ? "bg-brand text-on-brand" : "text-text-muted hover:bg-surface-sunken hover:text-text",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {o.label}
          </button>
        );
      })}
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
          {SORT_ORDER.map((c) => (
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
