"use client";

import Link from "next/link";
import { Component, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { auditCsv, csvFileName } from "@/domain/audit/csv";
import {
  NO_FILTERS,
  PAGE_SIZES,
  actionOptions,
  actorOptions,
  applyFilters,
  dayKey,
  isFiltering,
  kpis as countKpis,
  moduleOptions,
  pageInfo,
  pageSlice,
  sortEntries,
  toEntry,
  type AuditEntry,
  type AuditFilters,
  type AuditSort,
} from "@/domain/audit/view";
import { DbContext, useAudit } from "@/store/hooks";
import { AuditDrawer, IMMUTABLE_NOTE } from "./AuditDrawer";
import { AuditIllustration } from "./AuditIllustration";
import { AuditKpis } from "./AuditKpis";
import { AuditPagination } from "./AuditPagination";
import { AuditTable } from "./AuditTable";
import { AuditToolbar } from "./AuditToolbar";

/**
 * The Audit Log (TASK-14.6, redesigned TASK-38): every recorded action,
 * newest first. Read-only by design — no edit or delete path exists, and
 * viewing records nothing. Four states: loading, empty (no data / filtered),
 * error, working. Must render inside <Suspense> (it reads search params for
 * the E2E-only `__state` override).
 */
export function AuditView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  let body;
  if (forced === "loading") body = <AuditSkeleton />;
  else if (forced === "empty") body = <NoAudit />;
  else if (forced === "error" || !db) body = <AuditError onRetry={() => window.location.reload()} />;
  else
    body = (
      <AuditBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <AuditList />
      </AuditBoundary>
    );
  return (
    <section className="flex flex-col gap-5 p-4 md:p-7" aria-labelledby="audit-title">
      <header className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 id="audit-title" className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text md:text-[32px]">
            Audit Log
          </h1>
          <p className="text-text-muted">Every action taken in this workspace, newest first. Entries can’t be edited or deleted.</p>
        </div>
        <AuditIllustration className="hidden h-24 w-auto shrink-0 sm:block" />
      </header>
      {body}
    </section>
  );
}

function AuditList() {
  const events = useAudit();
  const [filters, setFilters] = useState<AuditFilters>(NO_FILTERS);
  const [sort, setSort] = useState<AuditSort>("newest");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  // "Now" for relative date ranges, refreshed whenever the date filter changes.
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const entries = useMemo(() => (events ?? []).map(toEntry), [events]);
  const counts = useMemo(() => countKpis(entries), [entries]);
  const options = useMemo(
    () => ({ actors: actorOptions(entries), modules: moduleOptions(entries), actions: actionOptions(entries) }),
    [entries],
  );
  const filtered = useMemo(() => sortEntries(applyFilters(entries, filters, now), sort), [entries, filters, now, sort]);

  if (!events) return <AuditSkeleton />;
  if (events.length === 0) return <NoAudit />;

  const info = pageInfo(filtered.length, page, size);
  const rows = pageSlice(filtered, info);
  const filtering = isFiltering(filters);

  const update = (next: AuditFilters) => {
    if (next.date !== filters.date) setNow(Date.now());
    setFilters(next);
    setPage(1);
  };
  const clear = () => update(NO_FILTERS);
  const onOpen = (e: AuditEntry, el: HTMLElement) => {
    trigger.current = el;
    setOpen(e);
  };
  const onClose = () => {
    setOpen(null);
    trigger.current?.focus();
  };
  const onExport = () => {
    const name = csvFileName(dayKey(Date.now()));
    const blob = new Blob([auditCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success(`Exported ${filtered.length} ${filtered.length === 1 ? "activity" : "activities"}`, { description: name });
  };

  return (
    <div className="flex flex-col gap-4" data-state="working">
      <AuditKpis kpis={counts} value={filters.kpi} onChange={(kpi) => update({ ...filters, kpi })} />
      <p className="-mt-2 text-[11px] text-text-muted">Counts cover all recorded activity in this workspace (all time).</p>

      <AuditToolbar
        filters={filters}
        onChange={update}
        onClear={clear}
        filtering={filtering}
        sort={sort}
        onSort={(s) => {
          setSort(s);
          setPage(1);
        }}
        actors={options.actors}
        modules={options.modules}
        actions={options.actions}
        shown={filtered.length}
        total={entries.length}
        onExport={onExport}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-6 shadow-card" data-state="empty-filtered">
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold text-text">No events match these filters</p>
            <p className="text-[13px] text-text-muted">Try a wider date range or fewer filters.</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={clear}>
            Reset filters
          </Button>
        </div>
      ) : (
        <>
          <AuditTable rows={rows} sort={sort} pageSize={size} onOpen={onOpen} />
          <AuditPagination
            info={info}
            size={size}
            onPage={setPage}
            onSize={(s) => {
              setSize(s);
              setPage(1);
            }}
          />
        </>
      )}

      <ImmutableNote />
      {open && <AuditDrawer entry={open} onClose={onClose} />}
    </div>
  );
}

function ImmutableNote() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-sunken p-3 text-xs text-text-muted" data-testid="audit-immutable">
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {IMMUTABLE_NOTE}
    </p>
  );
}

function NoAudit() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-8 text-center shadow-card" data-state="empty">
      <AuditIllustration className="h-20 w-auto" />
      <p className="font-display text-lg font-semibold text-text">No activity recorded yet</p>
      <p className="max-w-md text-[13px] text-text-muted">
        Actions, approvals and automated processing events will appear here as they happen.
      </p>
      <Link href="/" className="text-[13px] font-medium text-interactive hover:underline">
        Explore workspace
      </Link>
    </div>
  );
}

export function AuditSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-state="loading" aria-busy="true" aria-label="Loading audit log">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[88px] animate-pulse rounded-lg bg-surface-sunken" />
        ))}
      </div>
      <span className="h-24 animate-pulse rounded-lg bg-surface-sunken" />
      <div className="rounded-lg border border-border bg-surface px-4 shadow-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border py-3.5 last:border-b-0">
            <span className="h-3.5 w-28 animate-pulse rounded bg-surface-sunken" />
            <span className="size-8 animate-pulse rounded-full bg-surface-sunken" />
            <span className="h-3.5 w-1/3 animate-pulse rounded bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card" data-state="error">
      <p className="text-text">Couldn’t load the audit log.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

class AuditBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] audit log failed to load", error);
  }
  render() {
    return this.state.failed ? <AuditError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
