"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import { formatInr } from "@/domain/money";
import type { PriorityBand } from "@/domain/schema";
import { cn } from "@/lib/cn";
import { BandBadge } from "./BandBadge";
import { STATUS_LABELS } from "./FiltersPanel";
import { EXCLUDED_BANDS, disputeIdOf, overdueState, rowActions, type OverdueState } from "./queueActions";
import { RowMenu } from "./RowMenu";
import type { QueueRow } from "./useQueueTable";

export type Density = "table" | "compact";

/** Row tints by band (TASK-38): never the only cue — the badge carries the label. */
const ROW_TINT: Partial<Record<PriorityBand, string>> = {
  high: "bg-high-bg/50",
  needs_review: "bg-med-bg/50",
  disputed: "bg-disp-bg/50",
  hold_reconcile: "bg-disabled-bg/50",
  closed: "text-text-muted",
};

function overdueTone(s: OverdueState): string {
  if (s.kind === "overdue") return s.days > 30 ? "bg-high-bg text-high" : "bg-med-bg text-med";
  if (s.kind === "not_due") return "bg-low-bg text-low";
  return "bg-surface-sunken text-text-muted";
}

/**
 * The Queue table (TASK-38). One semantic table at every width: below `md`
 * its rows restyle into cards (display changes only — no second list, no
 * CSS `order`). Each row's single `a[href^="/invoices/"]` lives in the
 * Priority cell and wraps the badge plus visually-hidden invoice no.,
 * customer and reason, so the link text names the row. Clicking anywhere
 * else on the row (not a control) opens the invoice too.
 */
export function QueueTable({
  rows,
  density,
  selected,
  onToggle,
  onToggleAll,
  onReminder,
}: {
  rows: QueueRow[];
  density: Density;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onReminder: (row: QueueRow) => void;
}) {
  const router = useRouter();
  const ids = rows.map((r) => r.invoice.invoice_id);
  const chosen = ids.filter((id) => selected.has(id)).length;
  const all = chosen > 0 && chosen === ids.length;
  const some = chosen > 0 && !all;
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = some;
  }, [some]);

  const cell = density === "compact" ? "px-3 py-1.5" : "px-3 py-3";
  const th = "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-muted";

  function onRowClick(e: MouseEvent<HTMLTableRowElement>, id: string) {
    const t = e.target as Element;
    if (t.closest('a, button, input, label, select, [role="menu"]')) return;
    router.push(`/invoices/${id}`);
  }

  return (
    // `relative`: the scroller must be the containing block of absolutely
    // positioned descendants (the sr-only "Actions" header), or they sit at
    // their static x past the clip and widen the page (TC-062).
    // TASK-44: the tour rings this frame; scroll-mt keeps its top (the column
    // header and top-ranked rows) clear of the sticky top bar.
    <div data-tour="queue-list" className="relative scroll-mt-24 overflow-x-auto rounded-lg border border-border bg-surface shadow-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
      <table className="w-full min-w-[1000px] border-collapse text-sm max-md:block max-md:min-w-0">
        <caption className="sr-only">Invoices in priority order. Select a row to open its investigation.</caption>
        <thead className="border-b border-border bg-surface-sunken max-md:hidden">
          <tr>
            <th scope="col" className="w-12 px-3 py-2.5">
              <label className="grid size-6 cursor-pointer place-items-center">
                <input
                  ref={allRef}
                  type="checkbox"
                  aria-label="Select all invoices on this page"
                  checked={all}
                  onChange={() => onToggleAll(ids, !all)}
                  className="size-4 accent-brand"
                />
              </label>
            </th>
            <th scope="col" className={th}>Priority</th>
            <th scope="col" className={th}>Invoice No.</th>
            <th scope="col" className={th}>Customer</th>
            <th scope="col" className={cn(th, "text-right")}>Amount</th>
            <th scope="col" className={th}>Days Overdue</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Recommended action</th>
            <th scope="col" className="w-12 px-3 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col max-md:gap-2">
          {rows.map((r) => {
            const { invoice, priority } = r;
            const id = invoice.invoice_id;
            const number = invoice.invoice_number ?? id;
            const band = priority.band;
            const excluded = EXCLUDED_BANDS.includes(band);
            const disputeId = excluded ? disputeIdOf(priority.reason) : undefined;
            const overdue = overdueState(priority.days_overdue, band);
            const isSelected = selected.has(id);
            return (
              <tr
                key={id}
                data-tour={`queue-row-${id}`}
                data-selected={isSelected || undefined}
                data-band={band}
                onClick={(e) => onRowClick(e, id)}
                className={cn(
                  "cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-sunken",
                  ROW_TINT[band],
                  isSelected && "bg-brand-tint hover:bg-brand-tint",
                  // Phone: the row becomes a card; cells wrap into lines.
                  "max-md:relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:rounded-lg max-md:border max-md:p-3 max-md:pr-12 max-md:shadow-card max-md:last:border-b",
                  !ROW_TINT[band] && !isSelected && "max-md:bg-surface",
                )}
              >
                <td className={cn(cell, "w-12 max-md:p-0")}>
                  <label className="grid size-6 cursor-pointer place-items-center max-md:size-11">
                    <input
                      type="checkbox"
                      aria-label={`Select ${number}`}
                      checked={isSelected}
                      onChange={() => onToggle(id)}
                      className="size-4 accent-brand"
                    />
                  </label>
                </td>
                <td className={cn(cell, "max-md:p-0")}>
                  <div className="flex flex-col items-start gap-1">
                    <a
                      href={`/invoices/${id}`}
                      data-excluded={excluded || undefined}
                      className="rounded-md max-md:inline-flex max-md:min-h-6 max-md:items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
                    >
                      {excluded ? (
                        // The badge carries its cause (G4/G5/G7) as a title (TASK-9.5).
                        <BandBadge band={band} data-testid="excluded-badge" data-band={band} title={priority.reason}>
                          <span className="sr-only"> — excluded from queue</span>
                        </BandBadge>
                      ) : (
                        <BandBadge band={band} />
                      )}
                      <span className="sr-only">
                        {" "}
                        {number}, {r.customerName}. {priority.reason}
                      </span>
                    </a>
                    {disputeId && (
                      // A sibling of the row link (a-in-a is invalid HTML).
                      <a
                        href={`/disputes/${disputeId}`}
                        data-testid="dispute-link"
                        className="text-xs text-text-muted underline underline-offset-2 hover:text-text max-md:inline-flex max-md:min-h-6 max-md:items-center"
                      >
                        View dispute
                      </a>
                    )}
                  </div>
                </td>
                <td className={cn(cell, "whitespace-nowrap font-mono text-[13px] text-text max-md:p-0")}>
                  {number}
                </td>
                <td className={cn(cell, "max-md:basis-full max-md:p-0")}>
                  <span
                    title={r.customerName}
                    className="block max-w-[220px] truncate font-medium text-text max-md:max-w-full"
                  >
                    {r.customerName}
                  </span>
                </td>
                <td className={cn(cell, "whitespace-nowrap text-right font-medium tabular-nums text-text max-md:p-0")}>
                  {formatInr(r.outstanding)}
                </td>
                <td className={cn(cell, "whitespace-nowrap max-md:p-0")}>
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                      overdueTone(overdue),
                    )}
                  >
                    {overdue.label}
                    <span className="sr-only">{overdue.kind === "overdue" ? " overdue" : ""}</span>
                  </span>
                </td>
                <td className={cn(cell, "whitespace-nowrap text-text-muted max-md:p-0")}>
                  {STATUS_LABELS[invoice.status]}
                </td>
                <td className={cn(cell, "max-md:basis-full max-md:p-0")}>
                  <span className="flex max-w-[280px] items-center gap-1.5 text-text max-md:max-w-full" title={priority.reason}>
                    <span className="truncate">{priority.recommended_action}</span>
                  </span>
                </td>
                <td className={cn(cell, "w-12 max-md:absolute max-md:right-1.5 max-md:top-1.5 max-md:p-0")}>
                  <RowMenu
                    label={number}
                    actions={rowActions(r)}
                    onReminder={() => onReminder(r)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
