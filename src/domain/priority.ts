/**
 * The priority engine, config `priority.v1` (Architecture.md §5). Scores and
 * bands run only over ledger facts and matched, validated email signals
 * (`PrioritySignals`, built by `signals.ts`).
 */
import { daysBetween } from "./clock";
import { addPaise, formatInrWhole, subPaise, ZERO_PAISE, type Paise } from "./money";
import type { DataIssue, Invoice, Payment, Priority, PriorityBand, PriorityFactor } from "./schema";

const CONFIG_VERSION = "priority.v1";

/**
 * Email-derived facts the gates/scoring need (G4, G5, G7, broken-promise),
 * built by `signals.ts` from matched, validated extractions and open
 * disputes. Each map is invoice_id → the evidence id that caused it, so a
 * gate's reason can cite its source (TC-029).
 */
export interface PrioritySignals {
  disputed?: ReadonlyMap<string, string>;
  holdReconcile?: ReadonlyMap<string, string>;
  activeCommitment?: ReadonlyMap<string, string>;
  brokenPromise?: ReadonlyMap<string, string>;
}

export interface PriorityCtx {
  asOf: string;
  payments: Payment[];
  /** Average days late on each customer's paid invoices; `null`/absent = no history. */
  customerHistory: Map<string, number | null>;
  signals?: PrioritySignals;
  /** Ingest data issues; an `outstanding_amount` conflict on the invoice → G5 (FS8). */
  dataIssues?: DataIssue[];
}

/** A `prioritise()` result paired with its source invoice, for `rank()` — the
 * tie-break needs `outstanding` and `invoice_number`, neither of which lives
 * on `Priority` itself. */
export interface RankItem {
  invoice: Invoice;
  priority: Priority;
}

/** `rank()`'s own context: just enough to derive outstanding for the tie-break. */
export interface RankCtx {
  payments: Payment[];
}

/** A payment with no invoice (`invoice_id: null`, TASK-79.1) is unapplied
 * cash: it reduces no invoice's outstanding and is totalled separately
 * (`unappliedCashPaise` in aggregates.ts), never dropped (TC-003). */
export function isUnapplied(p: Payment): p is Payment & { invoice_id: null } {
  return p.invoice_id === null;
}

/** Σ payments applied to one invoice. Unapplied (null) payments never match. */
export function appliedPaiseOf(invoiceId: string, payments: readonly Payment[]): Paise {
  return payments
    .filter((p) => !isUnapplied(p) && p.invoice_id === invoiceId)
    .reduce((sum, p) => addPaise(sum, p.amount_paise), ZERO_PAISE);
}

/** Outstanding = amount − Σ applied payments. Exported so the Queue row (TASK-7.8)
 * shows the same figure `rank()`'s tie-break already uses. */
export function outstandingOf(inv: Invoice, ctx: RankCtx): Paise {
  return subPaise(inv.amount_paise, appliedPaiseOf(inv.invoice_id, ctx.payments));
}

function daysOverdueOf(inv: Invoice, ctx: PriorityCtx): number | null {
  if (inv.due_date === null) return null;
  return daysBetween(inv.due_date, ctx.asOf);
}

function daysOverduePoints(days: number): number {
  if (days >= 61) return 45;
  if (days >= 31) return 35;
  if (days >= 16) return 20;
  if (days >= 1) return 10;
  return 0;
}

function outstandingPoints(paise: number): number {
  if (paise >= 50_000_000) return 30; // >= ₹5,00,000.
  if (paise >= 20_000_000) return 20; // ₹2,00,000-4,99,999.
  if (paise >= 5_000_000) return 12; // ₹50,000-1,99,999.
  return 5; // < ₹50,000.
}

function behaviorPoints(avgDaysLate: number | null | undefined): number {
  if (avgDaysLate === null || avgDaysLate === undefined) return 5; // no history.
  if (avgDaysLate <= 5) return 0;
  if (avgDaysLate <= 20) return 5;
  if (avgDaysLate <= 45) return 10;
  return 15;
}

function bandLabel(band: PriorityBand): string {
  switch (band) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "needs_review":
      return "Needs review";
    case "disputed":
      return "Disputed";
    case "hold_reconcile":
      return "Hold – reconcile";
    case "not_due":
      return "Not due";
    case "on_hold_promised":
      return "On hold – promised";
    case "closed":
      return "Closed";
  }
}

function gateResult(
  invoiceId: string,
  gate: string,
  band: PriorityBand,
  recommendedAction: string,
  daysOverdue: number | null,
  cause?: string,
): Priority {
  return {
    invoice_id: invoiceId,
    config_version: CONFIG_VERSION,
    band,
    factors: [],
    gate,
    reason: `${bandLabel(band)}: ${recommendedAction}${cause ? ` [${cause}]` : ""}`,
    recommended_action: recommendedAction,
    days_overdue: daysOverdue,
  };
}

/**
 * Gates G1-G7 (first hit wins, order matters), then the score when none
 * fire. Architecture.md §5.
 */
export function prioritise(inv: Invoice, ctx: PriorityCtx): Priority {
  const derivedOutstanding = outstandingOf(inv, ctx);
  const daysOverdue = daysOverdueOf(inv, ctx);
  const signals = ctx.signals ?? {};

  // G1: closed. Overpaid (negative outstanding) closes too (R12).
  if (inv.status === "paid" || inv.status === "written_off" || derivedOutstanding <= 0) {
    return gateResult(inv.invoice_id, "G1", "closed", "None", daysOverdue);
  }
  // G2: unparseable/unknown status (FS10).
  if (inv.status === "unknown") {
    return gateResult(
      inv.invoice_id,
      "G2",
      "needs_review",
      "Confirm status with ledger owner",
      daysOverdue,
    );
  }
  // G3: invoice number or due date missing (FS1, FS2). Outstanding is always
  // derived (never literally absent — FS8 flags a *conflict*, not a missing
  // value), so it has no check here.
  if (inv.invoice_number === null || inv.due_date === null) {
    return gateResult(inv.invoice_id, "G3", "needs_review", "Complete missing field", daysOverdue);
  }
  // G4: open dispute.
  const disputeCause = signals.disputed?.get(inv.invoice_id);
  if (disputeCause !== undefined) {
    return gateResult(
      inv.invoice_id,
      "G4",
      "disputed",
      "Resolve dispute (Manager)",
      daysOverdue,
      disputeCause,
    );
  }
  // G5: payment-confirmation claim, ledger/email conflict, or a ledger
  // outstanding conflict from ingest (FS8).
  const outstandingConflict = ctx.dataIssues?.find(
    (d) =>
      d.record_id === inv.invoice_id && d.kind === "conflict" && d.field === "outstanding_amount",
  );
  const reconcileCause =
    signals.holdReconcile?.get(inv.invoice_id) ??
    (outstandingConflict ? `row ${inv.row_id} · outstanding_amount` : undefined);
  if (reconcileCause !== undefined) {
    return gateResult(
      inv.invoice_id,
      "G5",
      "hold_reconcile",
      "Reconcile payment",
      daysOverdue,
      reconcileCause,
    );
  }
  // G6: not yet due.
  if (daysOverdue !== null && daysOverdue < 0) {
    return gateResult(inv.invoice_id, "G6", "not_due", "Monitor", daysOverdue);
  }
  // G7: active commitment with a promised date not yet broken.
  const commitmentCause = signals.activeCommitment?.get(inv.invoice_id);
  if (commitmentCause !== undefined) {
    return gateResult(
      inv.invoice_id,
      "G7",
      "on_hold_promised",
      "Follow up after promised date",
      daysOverdue,
      commitmentCause,
    );
  }

  // No gate fired — score it.
  const days = daysOverdue ?? 0;
  const daysPts = daysOverduePoints(days);
  const outstandingPts = outstandingPoints(derivedOutstanding);
  const avgDaysLate = ctx.customerHistory.get(inv.customer_id);
  const behaviorPts = behaviorPoints(avgDaysLate);
  const brokenPromiseCause = signals.brokenPromise?.get(inv.invoice_id);
  const brokenPromise = brokenPromiseCause !== undefined;
  const brokenPromisePts = brokenPromise ? 10 : 0;

  const score = daysPts + outstandingPts + behaviorPts + brokenPromisePts;
  const band: PriorityBand = score >= 55 ? "high" : score >= 30 ? "medium" : "low";

  const factors: PriorityFactor[] = [];
  if (daysPts > 0) {
    factors.push({
      name: `${days} days overdue`,
      points: daysPts,
      evidenceId: `row ${inv.row_id} · due_date`,
    });
  }
  factors.push({
    name: `${formatInrWhole(derivedOutstanding)} outstanding`,
    points: outstandingPts,
    evidenceId: `row ${inv.row_id} · outstanding_amount`,
  });
  if (behaviorPts > 0) {
    factors.push({
      name: "customer payment history",
      points: behaviorPts,
      evidenceId: `customer ${inv.customer_id} · payment history`,
    });
  }
  if (brokenPromise) {
    factors.push({
      name: "promise broken",
      points: brokenPromisePts,
      evidenceId: brokenPromiseCause || `invoice ${inv.invoice_id} · commitment`,
    });
  }
  factors.sort((a, b) => b.points - a.points);

  const reason = `${bandLabel(band)} (${score}): ${factors
    .map((f) => `${f.name} [${f.evidenceId}]`)
    .join(" · ")}`;

  const recommendedAction =
    band === "high" ? "Send reminder now" : band === "medium" ? "Schedule a reminder" : "Monitor";

  return {
    invoice_id: inv.invoice_id,
    config_version: CONFIG_VERSION,
    band,
    score,
    factors,
    reason,
    recommended_action: recommendedAction,
    days_overdue: daysOverdue,
  };
}

/** Deterministic queue order: score desc → days overdue desc → outstanding
 * desc → invoice number asc. Total and stable — every pair compares, ties
 * fall through to the next key. */
export function rank(items: RankItem[], ctx: RankCtx): RankItem[] {
  return [...items].sort((a, b) => {
    const scoreA = a.priority.score ?? -Infinity;
    const scoreB = b.priority.score ?? -Infinity;
    if (scoreA !== scoreB) return scoreB - scoreA;

    const daysA = a.priority.days_overdue ?? -Infinity;
    const daysB = b.priority.days_overdue ?? -Infinity;
    if (daysA !== daysB) return daysB - daysA;

    const outstandingA = outstandingOf(a.invoice, ctx);
    const outstandingB = outstandingOf(b.invoice, ctx);
    if (outstandingA !== outstandingB) return outstandingB - outstandingA;

    const numA = a.invoice.invoice_number ?? "";
    const numB = b.invoice.invoice_number ?? "";
    return numA < numB ? -1 : numA > numB ? 1 : 0;
  });
}
