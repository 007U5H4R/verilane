import Link from "next/link";

import { PriorityChip } from "@/components/queue/PriorityChip";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/domain/clock";
import { EXCEPTION_KIND_LABEL, exceptionStatusLabel } from "@/domain/exceptions/list";
import { formatInr } from "@/domain/money";
import type { Permission } from "@/domain/permissions";
import { isPaymentExceptionKind } from "@/domain/schema";
import type { AuditEventRow } from "@/store/db";
import type { ExceptionCandidate, ExceptionDetail } from "@/store/hooks";
import { cn } from "@/lib/cn";

/**
 * `/exceptions/[id]` parts (TKT-75.02, Design-TASK-75 §8, §10, §11, §13, §14):
 * payment evidence, invoice facts per candidate, the audit trail (newest
 * first) and the action bar. Presentational only; the route supplies data.
 * No agent blocks or Policy card (79.3/79.4).
 */

const CARD = "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card";
const PROVENANCE = "break-words font-mono text-xs text-text-muted";

export function ExceptionDetailSkeleton() {
  return (
    <div className="p-4 sm:p-7">
      <RowSkeleton label="Loading exception" rows={5} />
    </div>
  );
}

export function ExceptionDetailError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Error loading exception. Retry?" onRetry={onRetry} />;
}

/**
 * Why "Submit for approval" is disabled, or `null` when it can run
 * (§11 disabled-with-reason). `permission` is `can("allocate_payment", …)`.
 */
export function allocateBlocker(d: ExceptionDetail, selected: string | null, permission: Permission): string | null {
  const x = d.exception;
  if (x.status !== "open") return "Already resolved";
  if (!isPaymentExceptionKind(x.kind)) return "Review this item in Inbox";
  if (!permission.allowed) return "Manager approval required";
  if (selected === null || !(x.candidate_invoice_ids ?? []).includes(selected)) return "Choose an invoice";
  return null;
}

export interface ExceptionDetailContentProps {
  detail: ExceptionDetail;
  selected: string | null;
  onSelect: (invoiceId: string) => void;
  permission: Permission;
  busy: boolean;
  onSubmit: () => void;
}

export function ExceptionDetailContent({ detail, selected, onSelect, permission, busy, onSubmit }: ExceptionDetailContentProps) {
  const x = detail.exception;
  const payment = isPaymentExceptionKind(x.kind);
  const blocker = allocateBlocker(detail, selected, permission);
  const reasonId = `submit-reason-${x.review_id}`;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4" data-state="working">
      <Link href="/exceptions" className="w-fit text-sm text-brand-strong underline">
        ← Back to exceptions
      </Link>
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
          {EXCEPTION_KIND_LABEL[x.kind]}
        </h1>
        <p className="flex flex-wrap items-center gap-2 font-mono text-[13px] text-text-muted">
          <span className="break-all">{x.review_id}</span>
          <Badge variant="outline" data-testid="exception-status">
            {exceptionStatusLabel(x)}
          </Badge>
        </p>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {payment && <PaymentEvidence detail={detail} />}
          <CandidateFacts
            candidates={detail.candidates}
            selectable={payment && x.status === "open"}
            selected={selected}
            onSelect={onSelect}
            allocatedTo={x.status === "actioned" ? (x.invoice_id ?? null) : null}
          />
          {(x.recommendation !== "" || x.escalation_reason !== "") && (
            <section className={CARD} aria-labelledby="exception-why">
              <h2 id="exception-why" className="font-semibold text-text">
                Why this needs review
              </h2>
              {x.recommendation !== "" && <p className="text-sm text-text">{x.recommendation}</p>}
              {x.escalation_reason !== "" && <p className="text-sm text-text-muted">{x.escalation_reason}</p>}
            </section>
          )}
        </div>
        <AuditTrail events={detail.audit} />
      </div>

      <div
        role="group"
        aria-label="Exception actions"
        className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
      >
        {blocker !== null && (
          <p id={reasonId} role="status" className="text-sm text-text-muted sm:mr-auto" data-testid="exception-submit-reason">
            {blocker}
            {blocker === "Review this item in Inbox" && (
              <>
                {" "}
                <Link href="/emails" className="text-brand-strong underline">
                  Open Inbox
                </Link>
              </>
            )}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          title={payment ? "Not available for a bank line" : "Review this item in Inbox"}
          className="max-md:min-h-11"
        >
          Mark disputed
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="exception-submit"
          disabled={blocker !== null || busy}
          aria-describedby={blocker !== null ? reasonId : undefined}
          onClick={onSubmit}
          className="max-md:min-h-11"
        >
          {busy ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </div>
  );
}

function PaymentEvidence({ detail }: { detail: ExceptionDetail }) {
  const x = detail.exception;
  const p = detail.payment;
  return (
    <section className={CARD} aria-labelledby="payment-evidence" data-testid="payment-evidence">
      <h2 id="payment-evidence" className="font-semibold text-text">
        Payment
      </h2>
      {p ? (
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-text-muted">Bank line</dt>
          <dd className="break-all font-mono text-text">{p.payment_id}</dd>
          <dt className="text-text-muted">Received</dt>
          <dd className="text-text">{formatDate(p.paid_on)}</dd>
          <dt className="text-text-muted">Amount</dt>
          <dd className="font-mono tabular-nums text-text">{formatInr(p.amount_paise)}</dd>
          <dt className="text-text-muted">Invoice</dt>
          <dd className="text-text">{p.invoice_id ?? "Unapplied"}</dd>
          <dt className="text-text-muted">Remittance</dt>
          <dd className="text-text">None on file — matched on amount</dd>
        </dl>
      ) : (
        <p className="text-sm text-text-muted">Bank line {x.payment_id ?? ""} is no longer on the ledger.</p>
      )}
      <p className={PROVENANCE}>
        Source: payments.csv · Row: {x.payment_id ?? "—"} · Field: amount_paise, invoice_id
      </p>
      <p className="text-sm text-text-muted" data-testid="unapplied-cash">
        Unapplied cash on the ledger: {formatInr(detail.unappliedCashPaise)} across {detail.unappliedCount}{" "}
        {detail.unappliedCount === 1 ? "bank line" : "bank lines"}
      </p>
    </section>
  );
}

function daysOverdueText(c: ExceptionCandidate): string {
  const d = c.priority?.days_overdue;
  if (d === null || d === undefined || d <= 0) return "Not overdue";
  return `${d} ${d === 1 ? "day" : "days"} overdue`;
}

function CandidateFacts({
  candidates,
  selectable,
  selected,
  onSelect,
  allocatedTo,
}: {
  candidates: readonly ExceptionCandidate[];
  selectable: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  allocatedTo: string | null;
}) {
  return (
    <section className={CARD} aria-labelledby="invoice-facts">
      <h2 id="invoice-facts" className="font-semibold text-text">
        {candidates.length > 1 ? "Candidate invoices" : "Invoice"}
      </h2>
      {candidates.length === 0 ? (
        <p className="text-sm text-text-muted">No open invoice matches this item.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {candidates.map((c) => {
            const id = c.invoice.invoice_id;
            const facts = (
              <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="text-text-muted">Invoice</dt>
                <dd className="min-w-0">
                  <Link href={`/invoices/${id}`} className="break-all font-medium text-brand-strong underline-offset-2 hover:underline">
                    {c.invoice.invoice_number ?? id}
                  </Link>
                  {allocatedTo === id && <Badge className="ml-2">Allocated</Badge>}
                </dd>
                <dt className="text-text-muted">Customer</dt>
                <dd className="min-w-0 break-words text-text">{c.customer?.name ?? c.invoice.customer_id}</dd>
                <dt className="text-text-muted">Outstanding</dt>
                <dd className="font-mono tabular-nums text-text">{formatInr(c.outstandingPaise)}</dd>
                <dt className="text-text-muted">Overdue</dt>
                <dd className="text-text">{daysOverdueText(c)}</dd>
                <dt className="text-text-muted">Priority</dt>
                <dd>{c.priority ? <PriorityChip band={c.priority.band} /> : "—"}</dd>
              </dl>
            );
            return (
              <li key={id} className="min-w-0 rounded-lg border border-border p-3">
                {selectable ? (
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="candidate"
                      value={id}
                      checked={selected === id}
                      onChange={() => onSelect(id)}
                      data-testid={`candidate-${id}`}
                      aria-label={`Allocate to ${c.invoice.invoice_number ?? id}`}
                      className="mt-1 size-4 shrink-0 accent-brand"
                    />
                    {facts}
                  </label>
                ) : (
                  facts
                )}
                <p className={cn(PROVENANCE, "mt-2")}>
                  Source: invoices.csv · Row: {id} · Field: amount_paise
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AuditTrail({ events }: { events: readonly AuditEventRow[] }) {
  return (
    <section className={cn(CARD, "h-fit")} aria-labelledby="exception-audit" data-testid="exception-audit">
      <h2 id="exception-audit" className="font-semibold text-text">
        Audit trail
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-text-muted">No actions yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e, i) => (
            <li key={e.event_id ?? i} className="flex min-w-0 flex-col gap-0.5 border-l-2 border-border pl-3">
              <p className="break-words text-sm text-text">{String(e.summary ?? e.action)}</p>
              <p className="text-xs text-text-muted">
                {typeof e.at === "string" ? formatDateTime(e.at) : "—"}
                {typeof e.actor_label === "string" ? ` · ${e.actor_label}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
