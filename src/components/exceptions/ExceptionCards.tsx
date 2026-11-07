import Link from "next/link";

import { PriorityChip } from "@/components/queue/PriorityChip";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExceptionRow } from "@/domain/exceptions/list";
import { formatInr } from "@/domain/money";
import { cn } from "@/lib/cn";

/**
 * The `/exceptions` row-card list and its states (TKT-75.02, Design-TASK-75
 * §5, §13). Presentational only: the route composes these with live data.
 */

const GRID = "lg:grid lg:grid-cols-[minmax(9rem,1.1fr)_minmax(0,2fr)_8rem_8rem_9rem_5rem] lg:items-center lg:gap-4";

export function ExceptionsLoading() {
  return <RowSkeleton rows={6} label="Loading exceptions" />;
}

export function ExceptionsError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Error loading exceptions. Retry?" onRetry={onRetry} />;
}

export function ExceptionsEmpty({ filtered, onClear }: { filtered: boolean; onClear?: () => void }) {
  if (filtered) {
    return (
      <EmptyState
        title="No exceptions match these filters"
        state="empty-filtered"
        action={
          onClear && (
            <Button variant="outline" size="sm" onClick={onClear}>
              Clear filters
            </Button>
          )
        }
      >
        Change or clear the filters to see every open exception.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      title="No exceptions to review"
      state="empty"
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/queue">Go to Queue</Link>
        </Button>
      }
    >
      No exceptions to review — go to Queue or check back later.
    </EmptyState>
  );
}

export function ExceptionCards({ rows }: { rows: readonly ExceptionRow[] }) {
  return (
    <div data-state="working" className="flex min-w-0 flex-col gap-2">
      <div
        aria-hidden
        className={cn(GRID, "hidden px-4 text-xs font-medium uppercase tracking-wide text-text-muted")}
      >
        <span>Kind</span>
        <span>Subject</span>
        <span className="text-right">Amount</span>
        <span>Status</span>
        <span>Priority</span>
        <span className="text-right">Action</span>
      </div>
      <ul className="flex min-w-0 flex-col gap-2" data-testid="exception-list" aria-label="Open exceptions">
        {rows.map((r) => (
          <li
            key={r.id}
            data-testid="exception-row"
            data-id={r.id}
            className={cn(
              GRID,
              "flex min-h-16 min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3 shadow-card",
              r.muted && "opacity-60",
            )}
          >
            <div className="flex min-w-0 items-center justify-between gap-2 lg:contents">
              <span className="truncate text-sm font-medium text-text">{r.kindLabel}</span>
              <span className="min-w-0 truncate text-sm text-text lg:order-none">
                <span className="sr-only lg:hidden">Subject: </span>
                {r.subject}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:contents">
              <span className="font-mono text-sm tabular-nums text-text lg:text-right">
                {r.amountPaise === null ? "Not available." : formatInr(r.amountPaise)}
              </span>
              <span className="text-sm text-text-muted">{r.statusLabel}</span>
              <span className="flex flex-wrap items-center gap-1">
                {r.band === null ? <span className="text-sm text-text-muted">—</span> : <PriorityChip band={r.band} />}
                {r.muted && <Badge variant="outline">Disputed — excluded from queue</Badge>}
              </span>
              <span className="ml-auto lg:ml-0 lg:text-right">
                <Link
                  href={r.href}
                  className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-brand-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-interactive lg:min-h-0"
                  aria-label={`Review ${r.kindLabel} ${r.id}`}
                >
                  Review
                </Link>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
