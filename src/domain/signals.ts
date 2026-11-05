/**
 * Builds the priority engine's email-derived signals (G4, G5, G7, broken
 * promise) from matched, validated extractions plus open Dispute records
 * (TASK-13.3). Pure. Only a `matched` outcome can raise a signal — an
 * ambiguous or unresolved email goes to review instead, never into a gate.
 * Each signal carries the evidence id that caused it.
 */
import { daysBetween } from "./clock";
import type { PrioritySignals } from "./priority";
import type { Exception, Extraction, Match } from "./schema";

/** Days after the promised date a commitment still holds the invoice (G7). */
export const PROMISE_GRACE_DAYS = 3;

export const OPEN_DISPUTE = new Set(["new", "under_review", "awaiting_customer"]);

export interface DisputeRecord {
  dispute_id: string;
  /** Absent for a "duplicate" pairing dispute, which gates via `holdReconcile`
   * instead (see the `duplicate_invoice` guard below) — never for any other
   * dispute type. */
  invoice_id?: string;
  status: string;
  type: string;
}

export interface SignalInput {
  asOf: string;
  extractions: Extraction[];
  matches: Match[];
  disputes: DisputeRecord[];
  /** Stored exceptions: an open `unallocated_payment` holds its candidate
   * invoices at G5 until the cash is allocated (TKT-75.02, EXE126). */
  exceptions?: Exception[];
}

const evidenceId = (x: Extraction, field: string) => `${x.message_id}:emails.json:${field}`;

function setOnce(map: Map<string, string>, key: string, value: string) {
  if (!map.has(key)) map.set(key, value);
}

export function deriveSignals(input: SignalInput): PrioritySignals {
  const disputed = new Map<string, string>();
  const holdReconcile = new Map<string, string>();
  const activeCommitment = new Map<string, string>();
  const brokenPromise = new Map<string, string>();

  const closedDispute = new Set<string>();
  for (const d of input.disputes) {
    // Duplicate-pairing disputes gate at G5 (holdReconcile) via the match
    // loop below, never at G4 — otherwise an open "duplicate_invoice" row
    // would double-gate an invoice already held for reconciliation (EXE10).
    if (d.type === "duplicate_invoice" || d.invoice_id === undefined) continue;
    if (OPEN_DISPUTE.has(d.status)) setOnce(disputed, d.invoice_id, `dispute ${d.dispute_id}`);
    else closedDispute.add(d.invoice_id);
  }

  const byMessage = new Map(input.extractions.map((x) => [x.message_id, x]));
  // Latest promise per invoice decides active vs broken.
  const latestPromise = new Map<string, { date: string; cause: string }>();

  for (const m of input.matches) {
    if (m.outcome !== "matched" || !m.invoice_id) continue;
    const x = byMessage.get(m.message_id);
    if (!x || x.status !== "valid") continue;
    const cause = evidenceId(x, "email_class");

    switch (x.email_class) {
      case "dispute":
        // A resolved/rejected Dispute record settles the email's claim.
        if (!closedDispute.has(m.invoice_id)) setOnce(disputed, m.invoice_id, cause);
        break;
      case "duplicate":
        // FS6: both invoices of the pair hold until someone reconciles them.
        for (const id of m.candidates) setOnce(holdReconcile, id, cause);
        break;
      case "confirmation":
        setOnce(holdReconcile, m.invoice_id, cause);
        break;
      case "commitment":
        if (x.commitment_date) {
          const prev = latestPromise.get(m.invoice_id);
          if (!prev || x.commitment_date > prev.date) {
            latestPromise.set(m.invoice_id, {
              date: x.commitment_date,
              cause: evidenceId(x, "commitment_date"),
            });
          }
        }
        break;
      default:
        break;
    }
  }

  // Related unapplied cash (TKT-75.02): a reminder could chase money that is
  // already in the bank, so every candidate invoice holds until allocated.
  for (const x of input.exceptions ?? []) {
    if (x.kind !== "unallocated_payment" || x.status !== "open" || !x.payment_id) continue;
    for (const id of x.candidate_invoice_ids ?? []) setOnce(holdReconcile, id, `${x.payment_id}:payments.csv:invoice_id`);
  }

  for (const [invoiceId, p] of latestPromise) {
    if (daysBetween(p.date, input.asOf) <= PROMISE_GRACE_DAYS) activeCommitment.set(invoiceId, p.cause);
    else brokenPromise.set(invoiceId, p.cause);
  }

  return { disputed, holdReconcile, activeCommitment, brokenPromise };
}
