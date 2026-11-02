"use client";

import { Component, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  Flag,
  Scale,
  Search,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FILTERS,
  filterCases,
  isFiltered,
  kpisFor,
  paginate,
  SORT_LABELS,
  SORTS,
  sortCases,
  toCsv,
  type DisputeCase,
  type DisputeFilters,
  type DisputeSort,
} from "@/domain/disputes/listing";
import {
  AGE_FILTER_OPTIONS,
  BULK_STATUS_EVENTS,
  canApply,
  ownerLabel,
  STATUS_FILTER_OPTIONS,
  type AgeFilter,
  type DisputeReviewer,
  type StatusFilter,
} from "@/domain/disputes/model";
import { formatInr, paise } from "@/domain/money";
import type { DisputeType } from "@/domain/schema";
import { cn } from "@/lib/cn";
import { DbContext, useExecute } from "@/store/hooks";
import { AssignMenu } from "./AssignMenu";
import { AgePill, DisputesArt, StatusPill } from "./DisputeBits";
import { DISPUTE_STATUS_LABELS, DISPUTE_TYPE_LABELS } from "./DisputeLabels";
import { SidePanel } from "./SidePanel";
import { useAssignDispute } from "./useAssignDispute";
import { useDisputeCases } from "./useDisputeCases";

// The investigation panel and resolve dialog load in their own chunk: both
// are only rendered once a row is opened, and pulling them out of the
// initial bundle keeps /disputes under the 300 KB gzip route budget
// (TASK-38, after TASK-25 · TC-083's precedent for Home's charts).
function PanelLoadingFallback() {
  return <div className="h-40 w-full animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />;
}
const DisputeInvestigation = dynamic(() => import("./DisputeInvestigation").then((m) => m.DisputeInvestigation), {
  loading: PanelLoadingFallback,
});
const ResolveDialog = dynamic(() => import("./ResolveDialog").then((m) => m.ResolveDialog));

const typeLabel = (t: DisputeType) => DISPUTE_TYPE_LABELS[t];
const statusLabel = (s: DisputeCase["dispute"]["status"]) => DISPUTE_STATUS_LABELS[s];
const money = (p: number) => formatInr(paise(p));
const TYPE_OPTIONS = Object.entries(DISPUTE_TYPE_LABELS) as [DisputeType, string][];
const CLOSED_REASON = "This dispute is closed.";

const FIELD =
  "h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Disputes (TASK-38, redesigning TASK-17.3): KPI cards that filter, a
 * searchable and sortable list of row cards with owner and actions, bulk
 * assign/status/export, and an investigation drawer. Four states: loading,
 * empty, error, working. Must render inside <Suspense> (it reads search
 * params). Nothing here chases a customer, closes a dispute on its own or
 * marks an invoice paid; every change is an audited command.
 */
export function DisputesView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  let body;
  if (forced === "loading") body = <WithHeader><RowSkeleton label="Loading disputes" /></WithHeader>;
  else if (forced === "empty") body = <WithHeader><NoDisputes /></WithHeader>;
  else if (forced === "error" || !db)
    body = <WithHeader><DisputesError onRetry={() => window.location.reload()} /></WithHeader>;
  else
    body = (
      <DisputesBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <DisputesBody />
      </DisputesBoundary>
    );

  return (
    <section className="flex min-w-0 flex-col gap-5 p-4 sm:p-7" aria-labelledby="disputes-title">
      {body}
    </section>
  );
}

function PageHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-center gap-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            id="disputes-title"
            className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]"
          >
            Disputes
          </h1>
          <p className="text-text-muted">What customers are disputing, and what needs to happen next.</p>
        </div>
        <DisputesArt className="hidden h-20 w-36 shrink-0 xl:block" />
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

function WithHeader({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader />
      {children}
    </>
  );
}

function downloadCsv(cases: DisputeCase[], name: string) {
  const csv = toCsv(cases, { type: typeLabel, status: statusLabel });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DisputesBody() {
  const cases = useDisputeCases();
  const execute = useExecute();
  const assign = useAssignDispute();
  const searchRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState<DisputeFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<DisputeSort>("latest");
  const [pageNo, setPageNo] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (cases ? sortCases(filterCases(cases, filters, typeLabel), sort) : []),
    [cases, filters, sort],
  );

  if (!cases) return <WithHeader><RowSkeleton label="Loading disputes" /></WithHeader>;
  if (cases.length === 0) return <WithHeader><NoDisputes /></WithHeader>;

  const kpis = kpisFor(cases);
  const page = paginate(visible, pageNo);
  const byId = new Map(cases.map((c) => [c.dispute.dispute_id, c]));
  const chosen = [...selected].map((id) => byId.get(id)).filter((c): c is DisputeCase => c !== undefined);
  const drawerItem = drawerId ? byId.get(drawerId) : undefined;
  const resolveItem = resolveId ? byId.get(resolveId) : undefined;
  const activeFilters =
    (filters.query.trim() ? 1 : 0) + (filters.status !== "all" ? 1 : 0) + (filters.type !== "all" ? 1 : 0) + (filters.age !== "all" ? 1 : 0);

  const update = (patch: Partial<DisputeFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPageNo(1);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pageIds = page.items.map((c) => c.dispute.dispute_id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  async function bulkAssign(reviewer: DisputeReviewer | null) {
    const targets = chosen.filter((c) => c.open && (c.dispute.assigned_reviewer ?? null) !== reviewer);
    const skipped = chosen.length - targets.length;
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const c of targets) {
      try {
        await execute({ type: "assign_dispute", subject: { kind: "dispute", id: c.dispute.dispute_id }, payload: { reviewer } });
        done++;
      } catch {
        failed.push(c.dispute.dispute_id);
      }
    }
    setBusy(false);
    const who = reviewer ?? "nobody (unassigned)";
    const parts = [`${done} assigned to ${who}`];
    if (skipped) parts.push(`${skipped} skipped (closed or already set)`);
    if (failed.length) parts.push(`${failed.length} failed: ${failed.join(", ")}`);
    (failed.length ? toast.error : toast.success)(`${parts.join("; ")}.`);
  }

  async function bulkStatus(event: string) {
    const option = BULK_STATUS_EVENTS.find((o) => o.event === event);
    if (!option) return;
    const targets = chosen.filter((c) => canApply(c.dispute.status, event));
    const skipped = chosen.length - targets.length;
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const c of targets) {
      try {
        await execute({ type: "dispute_transition", subject: { kind: "dispute", id: c.dispute.dispute_id }, payload: { event } });
        done++;
      } catch {
        failed.push(c.dispute.dispute_id);
      }
    }
    setBusy(false);
    const parts = [`${option.label}: ${done} updated`];
    if (skipped) parts.push(`${skipped} skipped (not allowed from their status)`);
    if (failed.length) parts.push(`${failed.length} failed: ${failed.join(", ")}`);
    (failed.length ? toast.error : toast.success)(`${parts.join("; ")}.`);
  }

  function onFilterButton() {
    if (window.matchMedia("(min-width: 768px)").matches) searchRef.current?.focus();
    else setFiltersOpen(true);
  }

  const headerActions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          downloadCsv(visible, "verilane-disputes.csv");
          toast.success(`Exported ${visible.length} dispute${visible.length === 1 ? "" : "s"}.`);
        }}
        disabled={visible.length === 0}
      >
        <Download aria-hidden className="size-3.5" />
        Export
      </Button>
      <AssignMenu
        current={undefined}
        disabled={chosen.length === 0 || busy}
        disabledReason="Select disputes to assign them."
        onAssign={(r) => void bulkAssign(r)}
        label={chosen.length ? `Assign ${chosen.length} selected disputes` : "Assign selected disputes"}
        buttonText="Assign selected"
      />
      <Button type="button" variant="outline" size="sm" onClick={onFilterButton} aria-label={`Filter disputes${activeFilters ? ` (${activeFilters} active)` : ""}`}>
        <SlidersHorizontal aria-hidden className="size-3.5" />
        Filter
        {activeFilters > 0 && (
          <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground tabular-nums">{activeFilters}</span>
        )}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader actions={headerActions} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Dispute summary — choose a card to filter">
        <KpiCard
          icon={Scale}
          tone="high"
          tinted
          label="Total open"
          value={kpis.total}
          caption={`${money(kpis.exposurePaise)} in dispute`}
          note={kpis.unpricedOpen ? `${kpis.unpricedOpen} without a verified amount, not counted` : undefined}
          pressed={filters.status === "open"}
          onClick={() => update({ status: filters.status === "open" ? "all" : "open" })}
        />
        <KpiCard
          icon={Flag}
          tone="high"
          label="Needs response"
          value={kpis.needsResponse}
          caption="Action required"
          pressed={filters.status === "needs_response"}
          onClick={() => update({ status: filters.status === "needs_response" ? "all" : "needs_response" })}
        />
        <KpiCard
          icon={Clock}
          tone="med"
          label="Awaiting customer"
          value={kpis.awaitingCustomer}
          caption="Waiting on customer"
          pressed={filters.status === "awaiting_customer"}
          onClick={() => update({ status: filters.status === "awaiting_customer" ? "all" : "awaiting_customer" })}
        />
        <KpiCard
          icon={CircleCheck}
          tone="low"
          label="In resolution"
          value={kpis.inResolution}
          caption="Being worked on"
          pressed={filters.status === "in_resolution"}
          onClick={() => update({ status: filters.status === "in_resolution" ? "all" : "in_resolution" })}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <label className="relative flex min-w-0 flex-1 items-center md:min-w-64">
            <span className="sr-only">Search disputes</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-text-muted" />
            <input
              ref={searchRef}
              type="search"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder="Search by customer, invoice no., or keyword..."
              className={cn(FIELD, "w-full pl-9")}
            />
          </label>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <FilterFields filters={filters} update={update} idPrefix="bar" />
          </div>
          {isFiltered(filters) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => update(DEFAULT_FILTERS)}>
              <X aria-hidden className="size-3.5" />
              Clear filters ({activeFilters})
            </Button>
          )}
        </div>

        {chosen.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border border-brand bg-brand-tint px-3 py-2 text-sm text-text"
            role="region"
            aria-label="Bulk actions"
          >
            <span className="font-medium tabular-nums" aria-live="polite">
              {chosen.length} selected
            </span>
            <AssignMenu
              current={undefined}
              disabled={busy}
              onAssign={(r) => void bulkAssign(r)}
              label={`Assign ${chosen.length} selected disputes`}
              buttonText="Assign"
              align="start"
            />
            <label className="flex items-center gap-2">
              <span className="sr-only">Change status of selected disputes</span>
              <select
                value=""
                disabled={busy}
                onChange={(e) => void bulkStatus(e.target.value)}
                className={cn(FIELD, "h-8")}
              >
                <option value="">Change status…</option>
                {BULK_STATUS_EVENTS.map((o) => (
                  <option key={o.event} value={o.event}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                downloadCsv(chosen, "verilane-disputes-selected.csv");
                toast.success(`Exported ${chosen.length} selected dispute${chosen.length === 1 ? "" : "s"}.`);
              }}
            >
              <Download aria-hidden className="size-3.5" />
              Export selected
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={busy}>
              Clear selection
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={allOnPage}
                disabled={pageIds.length === 0}
                onChange={() =>
                  setSelected((s) => {
                    const next = new Set(s);
                    for (const id of pageIds) {
                      if (allOnPage) next.delete(id);
                      else next.add(id);
                    }
                    return next;
                  })
                }
                className="size-4 accent-brand"
              />
              <span className="sr-only">Select all disputes on this page</span>
            </label>
            <p className="text-sm font-medium text-text tabular-nums" aria-live="polite">
              {visible.length} dispute{visible.length === 1 ? "" : "s"}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Sort by
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as DisputeSort);
                setPageNo(1);
              }}
              className={cn(FIELD, "h-8")}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="No disputes match these filters"
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => update(DEFAULT_FILTERS)}>
                Clear filters
              </Button>
            }
          >
            Try a different search, or clear the filters to see all {cases.length} disputes.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2" data-state="working" data-testid="dispute-list">
            {page.items.map((c) => (
              <DisputeRow
                key={c.dispute.dispute_id}
                item={c}
                checked={selected.has(c.dispute.dispute_id)}
                onToggle={() => toggle(c.dispute.dispute_id)}
                onOpen={() => setDrawerId(c.dispute.dispute_id)}
                onAssign={(r) => void assign(c.dispute.dispute_id, r)}
                onResolve={() => setResolveId(c.dispute.dispute_id)}
              />
            ))}
          </ul>
        )}

        {visible.length > 0 && (
          <nav aria-label="Dispute pages" className="flex flex-col items-center justify-between gap-2 border-t border-border pt-3 sm:flex-row">
            <p className="text-sm text-text-muted tabular-nums">
              Showing {page.from}–{page.to} of {page.total}
            </p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" disabled={page.page <= 1} onClick={() => setPageNo(page.page - 1)}>
                <ChevronLeft aria-hidden className="size-3.5" />
                Prev
              </Button>
              {Array.from({ length: page.pageCount }, (_, i) => i + 1).map((n) =>
                n === page.page ? (
                  <span
                    key={n}
                    aria-current="page"
                    className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-semibold text-brand-foreground tabular-nums"
                  >
                    <span className="sr-only">Page </span>
                    {n}
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPageNo(n)}
                    aria-label={`Page ${n}`}
                    className="grid size-8 place-items-center rounded-lg text-sm text-text tabular-nums hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {n}
                  </button>
                ),
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page.page >= page.pageCount}
                onClick={() => setPageNo(page.page + 1)}
              >
                Next
                <ChevronRight aria-hidden className="size-3.5" />
              </Button>
            </div>
          </nav>
        )}
      </div>

      <SidePanel open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" widthClass="sm:max-w-sm">
        <div className="flex flex-col gap-3">
          <FilterFields filters={filters} update={update} idPrefix="panel" stacked />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => update(DEFAULT_FILTERS)} disabled={!isFiltered(filters)}>
              Clear filters
            </Button>
            <Button type="button" size="sm" onClick={() => setFiltersOpen(false)}>
              Show {visible.length} dispute{visible.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </SidePanel>

      {drawerItem && (
        <SidePanel
          open
          onClose={() => setDrawerId(null)}
          title={drawerItem.customerName}
          subtitle={
            <span className="font-mono text-[13px]">
              {drawerItem.dispute.dispute_id} · {drawerItem.invoiceLabel}
            </span>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/disputes/${drawerItem.dispute.dispute_id}`} className="text-sm text-brand-strong underline">
                Open full page
              </Link>
              <div className="flex items-center gap-2">
                <AssignMenu
                  current={drawerItem.dispute.assigned_reviewer ?? null}
                  disabled={!drawerItem.open}
                  disabledReason={CLOSED_REASON}
                  onAssign={(r) => void assign(drawerItem.dispute.dispute_id, r)}
                  label={`Assign owner for ${drawerItem.dispute.dispute_id}`}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!drawerItem.open}
                  title={drawerItem.open ? undefined : CLOSED_REASON}
                  onClick={() => setResolveId(drawerItem.dispute.dispute_id)}
                >
                  Resolve
                </Button>
              </div>
            </div>
          }
        >
          <DisputeInvestigation item={drawerItem} />
        </SidePanel>
      )}

      {resolveItem && (
        <ResolveDialog
          key={resolveItem.dispute.dispute_id}
          item={resolveItem}
          open
          onOpenChange={(o) => {
            if (!o) setResolveId(null);
          }}
        />
      )}
    </>
  );
}

const KPI_TONE = {
  high: { icon: "bg-high-bg text-high", dot: "bg-high", pill: "bg-high-bg text-high" },
  med: { icon: "bg-med-bg text-med", dot: "bg-med", pill: "bg-med-bg text-med" },
  low: { icon: "bg-low-bg text-low", dot: "bg-low", pill: "bg-low-bg text-low" },
} as const;

/** A summary card that doubles as a status filter (aria-pressed). Counts come from `kpisFor`. */
function KpiCard({
  icon: Icon,
  tone,
  tinted,
  label,
  value,
  caption,
  note,
  pressed,
  onClick,
}: {
  icon: LucideIcon;
  tone: keyof typeof KPI_TONE;
  tinted?: boolean;
  label: string;
  value: number;
  caption: string;
  note?: string;
  pressed: boolean;
  onClick: () => void;
}) {
  const t = KPI_TONE[tone];
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex items-start gap-4 rounded-2xl border p-4 text-left shadow-card transition-colors motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        tinted ? "border-high bg-high-bg" : "border-border bg-surface hover:bg-surface-sunken",
        pressed && "ring-2 ring-brand",
      )}
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tinted ? "bg-surface text-high" : t.icon)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        <span className="font-display text-[28px] font-semibold leading-none text-text tabular-nums">{value}</span>
        <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", tinted ? "bg-surface text-high" : t.pill)}>
          <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />
          {caption}
        </span>
        {note && <span className="text-xs text-text-muted">{note}</span>}
      </span>
    </button>
  );
}

function FilterFields({
  filters,
  update,
  idPrefix,
  stacked,
}: {
  filters: DisputeFilters;
  update: (patch: Partial<DisputeFilters>) => void;
  idPrefix: string;
  stacked?: boolean;
}) {
  const wrap = stacked ? "flex flex-col gap-1 text-sm text-text" : "flex items-center";
  const label = stacked ? "" : "sr-only";
  return (
    <>
      <label className={wrap} htmlFor={`${idPrefix}-status`}>
        <span className={label}>Status</span>
        <select
          id={`${idPrefix}-status`}
          value={filters.status}
          onChange={(e) => update({ status: e.target.value as StatusFilter })}
          className={FIELD}
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === "all" ? "Status: All" : o.label}
            </option>
          ))}
          {!STATUS_FILTER_OPTIONS.some((o) => o.value === filters.status) && (
            <option value={filters.status}>{groupLabel(filters.status)}</option>
          )}
        </select>
      </label>
      <label className={wrap} htmlFor={`${idPrefix}-type`}>
        <span className={label}>Dispute type</span>
        <select
          id={`${idPrefix}-type`}
          value={filters.type}
          onChange={(e) => update({ type: e.target.value as DisputeType | "all" })}
          className={FIELD}
        >
          <option value="all">Dispute type: All</option>
          {TYPE_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className={wrap} htmlFor={`${idPrefix}-age`}>
        <span className={label}>Age</span>
        <select
          id={`${idPrefix}-age`}
          value={filters.age}
          onChange={(e) => update({ age: e.target.value as AgeFilter })}
          className={FIELD}
        >
          {AGE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === "all" ? "Age: All" : o.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Label for a KPI group filter that is not one of the select's own options. */
function groupLabel(status: StatusFilter): string {
  if (status === "needs_response") return "Needs response";
  if (status === "in_resolution") return "In resolution";
  if (status === "closed") return "Closed";
  return String(status);
}

function DisputeRow({
  item,
  checked,
  onToggle,
  onOpen,
  onAssign,
  onResolve,
}: {
  item: DisputeCase;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAssign: (r: DisputeReviewer | null) => void;
  onResolve: () => void;
}) {
  const { dispute, email } = item;
  const id = dispute.dispute_id;
  return (
    <li
      data-testid="dispute-row"
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-surface p-3 transition-colors motion-reduce:transition-none",
        "xl:grid-cols-[auto_auto_minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,2.2fr)_minmax(0,1fr)_auto_auto] xl:items-center xl:gap-x-4",
        checked ? "border-brand bg-brand-tint" : "border-border hover:bg-surface-sunken",
      )}
    >
      <div className="flex items-center gap-1 xl:contents">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select dispute ${id}`}
          className="size-4 accent-brand"
        />
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open details for ${id}`}
          className="grid size-8 place-items-center rounded-lg text-text-muted hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-col xl:items-start xl:gap-1">
        <StatusPill status={dispute.status} />
        <Link
          href={`/disputes/${id}`}
          className="font-mono text-[13px] text-brand-strong underline-offset-2 hover:underline"
          aria-label={`${item.invoiceLabel} — open dispute ${id}`}
        >
          {item.invoiceLabel}
        </Link>
      </div>

      <div className="col-span-2 flex min-w-0 flex-col xl:col-span-1">
        <span className="truncate text-sm font-semibold text-text">{item.customerName}</span>
        <span className="truncate font-mono text-xs text-text-muted">{dispute.customer_id}</span>
      </div>

      <div className="col-span-2 flex min-w-0 flex-col gap-0.5 xl:col-span-1">
        <span className="text-sm font-semibold text-text">{DISPUTE_TYPE_LABELS[dispute.type]}</span>
        <p className="line-clamp-2 text-[13px] text-text-muted">{dispute.claim_text}</p>
        {email && (
          <p className="truncate font-mono text-[11px] text-text-muted" data-testid="dispute-provenance">
            {email.from_address} · {email.subject}
          </p>
        )}
      </div>

      <div className="col-span-2 flex items-center justify-between gap-3 xl:contents">
        <div className="flex flex-col xl:items-end">
          <span className="text-sm font-semibold text-text tabular-nums">
            {item.amountPaise === null ? "—" : money(item.amountPaise)}
          </span>
          {item.amountNote && <span className="text-[11px] text-text-muted">{item.amountNote}</span>}
        </div>
        <AgePill age={item.age} />
      </div>

      <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 xl:col-span-1 xl:flex-col xl:items-end xl:border-0 xl:pt-0">
        <span className="text-xs text-text-muted">
          Owner: <span className="font-medium text-text">{ownerLabel(dispute.assigned_reviewer)}</span>
        </span>
        <div className="flex items-center gap-2">
          <AssignMenu
            current={dispute.assigned_reviewer ?? null}
            disabled={!item.open}
            disabledReason={CLOSED_REASON}
            onAssign={onAssign}
            label={`Assign owner for ${id}`}
          />
          <Button
            type="button"
            size="sm"
            disabled={!item.open}
            title={item.open ? undefined : CLOSED_REASON}
            onClick={onResolve}
            aria-label={`Resolve ${id}`}
          >
            Resolve
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * No data yet. Loading or importing data lives in Settings (TASK-19), so
 * this state links there instead of running a loader itself.
 */
function NoDisputes() {
  return (
    <EmptyState
      title="No disputes yet"
      action={
        <Button asChild size="sm">
          <Link href="/settings#import">Load or import data</Link>
        </Button>
      }
    >
      Load the demo set or import your own CSV in Settings to see disputed invoices.
    </EmptyState>
  );
}

function DisputesError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Couldn’t load disputes." onRetry={onRetry} />;
}

class DisputesBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] disputes failed to load", error);
  }
  render() {
    return this.state.failed ? (
      <WithHeader>
        <DisputesError onRetry={this.props.onRetry} />
      </WithHeader>
    ) : (
      this.props.children
    );
  }
}
