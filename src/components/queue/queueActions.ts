/**
 * Pure rules behind the redesigned Queue (TASK-38): KPI counts, which rows
 * may get a reminder draft, which row-menu actions are valid, how "days
 * overdue" reads, and the pagination window. No React, no I/O — the view
 * renders these and the unit tests pin them.
 */
import { ZERO_PAISE, addPaise, type Paise } from "@/domain/money";
import type { PriorityBand } from "@/domain/schema";
import type { QueueRow } from "./useQueueTable";

/** Bands held out of chasing (TASK-9.5): shown muted with a badge, never removed. */
export const EXCLUDED_BANDS: readonly PriorityBand[] = ["disputed", "hold_reconcile", "on_hold_promised"];

/**
 * The only bands a reminder may be drafted for. Everything else is either
 * blocked (disputed, hold – reconcile, on hold – promised), not chaseable
 * (not due, closed) or unknown until a human fixes the record (needs review).
 * `generate_draft` itself does not refuse a disputed invoice, so the Queue
 * gates it here (financial safeguard, TASK-38 brief).
 */
export const REMINDER_BANDS: readonly PriorityBand[] = ["high", "medium"];

const INELIGIBLE_REASON: Record<PriorityBand, string> = {
  high: "",
  medium: "",
  low: "Low priority — monitor, don’t chase yet",
  needs_review: "Needs review — record is incomplete or its status is unknown",
  disputed: "Disputed — resolve the dispute first",
  hold_reconcile: "On hold — reconcile the payment first",
  not_due: "Not due yet",
  on_hold_promised: "Customer promised payment — follow up after the promised date",
  closed: "Closed — nothing outstanding",
};

export type Eligibility = { eligible: true } | { eligible: false; reason: string };

export function reminderEligibility(band: PriorityBand): Eligibility {
  return REMINDER_BANDS.includes(band) ? { eligible: true } : { eligible: false, reason: INELIGIBLE_REASON[band] };
}

/** Splits a selection into rows a draft may be generated for and the refused rest. */
export function partitionForDrafts(rows: QueueRow[]): {
  eligible: QueueRow[];
  refused: { row: QueueRow; reason: string }[];
} {
  const eligible: QueueRow[] = [];
  const refused: { row: QueueRow; reason: string }[] = [];
  for (const row of rows) {
    const e = reminderEligibility(row.priority.band);
    if (e.eligible) eligible.push(row);
    else refused.push({ row, reason: e.reason });
  }
  return { eligible, refused };
}

/** A disputed row's reason carries "[dispute D-xxx]" (priority.ts's G4 gate). */
export function disputeIdOf(reason: string): string | undefined {
  return /\[dispute (D-[^\]]+)\]/.exec(reason)?.[1];
}

export type RowAction =
  | { kind: "investigate"; label: string; href: string }
  | { kind: "emails"; label: string; href: string }
  | { kind: "dispute"; label: string; href: string }
  | { kind: "reminder"; label: string };

/**
 * The row menu offers only actions the data model supports for that row.
 * "Mark for review" and a separate "View evidence" are deliberately absent:
 * there is no review command, and evidence lives on the Investigation page.
 */
export function rowActions(row: Pick<QueueRow, "invoice" | "priority">): RowAction[] {
  const id = row.invoice.invoice_id;
  const actions: RowAction[] = [
    { kind: "investigate", label: "Investigate invoice", href: `/invoices/${id}` },
    { kind: "emails", label: "View related emails", href: `/invoices/${id}#ev-communication` },
  ];
  const disputeId = disputeIdOf(row.priority.reason);
  if (disputeId) actions.push({ kind: "dispute", label: "View dispute", href: `/disputes/${disputeId}` });
  if (reminderEligibility(row.priority.band).eligible) actions.push({ kind: "reminder", label: "Generate reminder draft" });
  return actions;
}

export interface QueueKpis {
  total: number;
  /** Sum of outstanding over rows that are not closed (overpaid rows close, R12). */
  outstanding: Paise;
  high: number;
  needsReview: number;
  disputed: number;
}

export function queueKpis(rows: QueueRow[]): QueueKpis {
  let outstanding = ZERO_PAISE;
  let high = 0;
  let needsReview = 0;
  let disputed = 0;
  for (const r of rows) {
    const band = r.priority.band;
    if (band !== "closed") outstanding = addPaise(outstanding, r.outstanding);
    if (band === "high") high++;
    else if (band === "needs_review") needsReview++;
    else if (band === "disputed") disputed++;
  }
  return { total: rows.length, outstanding, high, needsReview, disputed };
}

export type OverdueState =
  | { kind: "overdue"; days: number; label: string }
  | { kind: "not_due"; label: string }
  | { kind: "closed"; label: string }
  | { kind: "unknown"; label: string };

/** Never negative: not-yet-due and unknown are their own states, not numbers. */
export function overdueState(daysOverdue: number | null, band: PriorityBand): OverdueState {
  if (band === "closed") return { kind: "closed", label: "Closed" };
  if (daysOverdue === null) return { kind: "unknown", label: "Unknown" };
  if (daysOverdue <= 0) return { kind: "not_due", label: "Not due" };
  return { kind: "overdue", days: daysOverdue, label: `${daysOverdue} ${daysOverdue === 1 ? "day" : "days"}` };
}

/** Page buttons: always first and last, the current page ±1, gaps as "gap". */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const keep = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (typeof last === "number" && p - last > 1) out.push(p - last === 2 ? last + 1 : "gap");
    out.push(p);
  }
  return out;
}

/** "Showing a–b of n" bounds for a 1-based page. */
export function showingRange(page: number, pageSize: number, matched: number): { from: number; to: number } {
  if (matched === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(matched, page * pageSize) };
}
