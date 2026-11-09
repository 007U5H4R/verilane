import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/domain/clock";
import { formatInr, formatSignedInr, paise, type Paise } from "@/domain/money";
import type { Permission } from "@/domain/permissions";
import type { Exception } from "@/domain/schema";
import { isShortPaymentKind } from "@/domain/shortPayments";
import type { CreditNoteRow } from "@/store/db";
import type { ExceptionDetail } from "@/store/hooks";
import { cn } from "@/lib/cn";

/**
 * TKT-75.05 (Design-TASK-75 §8, §11, §15; FS18/FS19; R4): the short-payment
 * parts of `/exceptions/[id]`. Presentational only — the route supplies the
 * data; the confirm dialog and the command live in `WriteOffDialog.tsx`.
 *
 *  - `ShortPaymentSection`: history, total deducted, stated reasons. A
 *    missing reason is "Needs review" with no assumed deduction type (FS18).
 *  - `CreditNoteEvidence`: only rendered once a CreditNote row exists.
 *  - `WriteOffControl`: the Manager-only "Approve write-off" button for the
 *    action bar; hidden for an Analyst (no dead control, EXE154).
 *
 * Muted (written-off) rows use `bg-surface-sunken` plus a text badge, never
 * `opacity-*` on text (TASK-88, WCAG 1.4.3).
 */

const CARD = "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card";
const PROVENANCE = "break-words font-mono text-xs text-text-muted";

export interface ShortPaymentHistoryRow {
  reviewId: string;
  invoiceId: string | null;
  paymentId: string | null;
  deductedPaise: Paise;
  /** The payer's stated reason, verbatim; `null` when none was given (FS18). */
  reason: string | null;
  open: boolean;
}

export interface ShortPaymentHistory {
  rows: ShortPaymentHistoryRow[];
  totalPaise: Paise;
  /** For a patterned instance: the pattern it belongs to. */
  patternId: string | null;
}

function historyRow(x: Exception): ShortPaymentHistoryRow {
  return {
    reviewId: x.review_id,
    invoiceId: x.invoice_id ?? null,
    paymentId: x.payment_id ?? null,
    deductedPaise: paise(x.deducted_paise ?? 0),
    reason: x.deduction_reason ?? null,
    open: x.status === "open",
  };
}

/**
 * A pattern's history is its linked instances; an instance's is itself
 * (`shortPaymentInstances` then holds its pattern, if any — never listed as
 * a payment).
 */
export function shortPaymentHistory(d: ExceptionDetail): ShortPaymentHistory {
  const x = d.exception;
  const pattern = x.kind === "short_payment_pattern";
  const rows = pattern
    ? d.shortPaymentInstances.filter((i) => i.kind === "short_payment").map(historyRow)
    : [historyRow(x)];
  const patternId = pattern ? null : (d.shortPaymentInstances.find((i) => i.kind === "short_payment_pattern")?.review_id ?? null);
  return { rows, totalPaise: paise(rows.reduce((sum, r) => sum + r.deductedPaise, 0)), patternId };
}

/** The open pattern a patterned instance belongs to, if any. */
function openPatternOf(d: ExceptionDetail): Exception | null {
  if (d.exception.kind !== "short_payment") return null;
  return d.shortPaymentInstances.find((i) => i.kind === "short_payment_pattern" && i.status === "open") ?? null;
}

/**
 * What `approve_write_off` would write off from this exception, or `null`
 * when there's nothing to approve here: not a short kind, already closed,
 * a target already closed (the command would refuse), or a patterned
 * instance whose open pattern is where the write-off belongs (EXE155).
 */
export function writeOffTarget(d: ExceptionDetail): { count: number; totalPaise: Paise } | null {
  const x = d.exception;
  if (!isShortPaymentKind(x.kind) || x.status !== "open") return null;
  if (openPatternOf(d) !== null) return null;
  const { rows, totalPaise } = shortPaymentHistory(d);
  if (rows.length === 0 || rows.some((r) => !r.open)) return null;
  return { count: rows.length, totalPaise };
}

function creditNoteFor(notes: readonly CreditNoteRow[], invoiceId: string | null): CreditNoteRow | undefined {
  return invoiceId === null ? undefined : notes.find((n) => n.invoice_id === invoiceId);
}

export function ShortPaymentSection({ detail }: { detail: ExceptionDetail }) {
  const x = detail.exception;
  const { rows, totalPaise, patternId } = shortPaymentHistory(detail);
  return (
    <section className={CARD} aria-labelledby="short-payment-history" data-testid="short-payment-history">
      <h2 id="short-payment-history" className="font-semibold text-text">
        Short payments
      </h2>
      <p className="text-sm text-text">
        Total deducted: <span className="font-mono tabular-nums">{formatSignedInr(paise(-totalPaise))}</span> across{" "}
        {rows.length} short {rows.length === 1 ? "payment" : "payments"}
        {x.customer_id !== undefined && <span className="text-text-muted"> · Customer {x.customer_id}</span>}
      </p>
      {patternId !== null && (
        <p className="text-sm text-text-muted">
          Part of a repeated short-payment pattern:{" "}
          <Link href={`/exceptions/${patternId}`} className="break-all text-brand-strong underline">
            {patternId}
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">No short payments are on the ledger for this pattern.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {rows.map((r) => {
            const writtenOff = !r.open && creditNoteFor(detail.creditNotes, r.invoiceId) !== undefined;
            return (
              <li
                key={r.reviewId}
                className={cn("min-w-0 rounded-lg border border-border p-3", !r.open && "bg-surface-sunken")}
                data-testid="short-payment-row"
              >
                <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-text-muted">Invoice</dt>
                  <dd className="min-w-0">
                    {r.invoiceId !== null ? (
                      <Link href={`/invoices/${r.invoiceId}`} className="break-all font-medium text-brand-strong underline-offset-2 hover:underline">
                        {r.invoiceId}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {!r.open && (
                      <Badge variant="outline" className="ml-2">
                        {writtenOff ? "Written off" : "Closed"}
                      </Badge>
                    )}
                  </dd>
                  <dt className="text-text-muted">Deducted</dt>
                  <dd className="font-mono tabular-nums text-text">{formatSignedInr(paise(-r.deductedPaise))}</dd>
                  <dt className="text-text-muted">Reason</dt>
                  <dd className="min-w-0 break-words text-text">
                    {r.reason !== null ? (
                      r.reason
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-med-bg px-2 py-0.5 text-xs font-medium text-med" data-testid="short-payment-needs-review">
                          Needs review
                        </span>
                        <span className="text-text-muted">No reason stated — no deduction type assumed</span>
                      </span>
                    )}
                  </dd>
                  <dt className="text-text-muted">Exception</dt>
                  <dd className="min-w-0">
                    <Link href={`/exceptions/${r.reviewId}`} className="break-all font-mono text-xs text-brand-strong underline-offset-2 hover:underline">
                      {r.reviewId}
                    </Link>
                  </dd>
                </dl>
                <p className={cn(PROVENANCE, "mt-2")}>
                  Source: payments.csv · Row: {r.paymentId ?? "—"} · Field: amount_paise, deduction_reason
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const APPROVER_LABEL: Record<string, string> = { manager: "Manager", analyst: "Analyst" };

/** Design §8: the CreditNote group — rendered only once a note exists (not a placeholder). */
export function CreditNoteEvidence({ creditNotes }: { creditNotes: readonly CreditNoteRow[] }) {
  if (creditNotes.length === 0) return null;
  return (
    <section className={CARD} aria-labelledby="credit-note-evidence" data-testid="credit-note-evidence">
      <h2 id="credit-note-evidence" className="font-semibold text-text">
        {creditNotes.length === 1 ? "Credit note" : "Credit notes"}
      </h2>
      <ul className="flex min-w-0 flex-col gap-3">
        {creditNotes.map((n) => {
          const amount = typeof n.amount_paise === "number" ? formatInr(paise(n.amount_paise)) : "—";
          const approver = typeof n.approved_by === "string" ? (APPROVER_LABEL[n.approved_by] ?? n.approved_by) : "—";
          return (
            <li key={n.credit_note_id} className="min-w-0 rounded-lg border border-border p-3">
              <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="text-text-muted">Credit note</dt>
                <dd className="break-all font-mono text-text">{n.credit_note_id}</dd>
                <dt className="text-text-muted">Invoice</dt>
                <dd className="min-w-0">
                  <Link href={`/invoices/${n.invoice_id}`} className="break-all text-brand-strong underline-offset-2 hover:underline">
                    {n.invoice_id}
                  </Link>
                </dd>
                <dt className="text-text-muted">Amount</dt>
                <dd className="font-mono tabular-nums text-text">{amount}</dd>
                <dt className="text-text-muted">Reason</dt>
                <dd className="min-w-0 break-words text-text">{typeof n.reason === "string" ? n.reason : "—"}</dd>
                <dt className="text-text-muted">Approved by</dt>
                <dd className="text-text">{approver}</dd>
                <dt className="text-text-muted">Created</dt>
                <dd className="text-text">{formatDateTime(n.created_at)}</dd>
              </dl>
              <p className={cn(PROVENANCE, "mt-2")}>
                Source: creditNotes · Row: {n.credit_note_id} · Field: amount_paise
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface WriteOffControlProps {
  detail: ExceptionDetail;
  /** `can(role, "approve_write_off", …)`. */
  permission: Permission;
  busy: boolean;
  onRequest: () => void;
}

/**
 * The action-bar control (EXE154). Nothing for an Analyst. For a Manager on
 * a patterned instance whose pattern is open, a link to the pattern instead
 * — the write-off belongs there, and writing off one instance first would
 * make the pattern's write-off refuse (EXE155).
 */
export function WriteOffControl({ detail, permission, busy, onRequest }: WriteOffControlProps) {
  if (!permission.allowed) return null;
  const pattern = detail.exception.status === "open" ? openPatternOf(detail) : null;
  if (pattern !== null) {
    return (
      <Link
        href={`/exceptions/${pattern.review_id}`}
        className="text-sm text-brand-strong underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
        data-testid="write-off-from-pattern"
      >
        Write off from the pattern
      </Link>
    );
  }
  const target = writeOffTarget(detail);
  if (target === null) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-testid="approve-write-off"
      disabled={busy}
      onClick={onRequest}
      className="max-md:min-h-11"
    >
      {busy ? "Writing off…" : `Approve write-off (${formatInr(target.totalPaise)})`}
    </Button>
  );
}
