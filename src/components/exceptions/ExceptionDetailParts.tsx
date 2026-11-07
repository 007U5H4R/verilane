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
import type { AuditEventRow, PolicyDecisionRow } from "@/store/db";
import type { ExceptionCandidate, ExceptionDetail } from "@/store/hooks";
import { cn } from "@/lib/cn";

/**
 * `/exceptions/[id]` parts (TKT-75.02, Design-TASK-75 §8, §10, §11, §13, §14):
 * payment evidence, invoice facts per candidate, the audit trail (newest
 * first) and the action bar. Presentational only; the route supplies data.
 *
 * TKT-75.03 (Design-TASK-75 §4, §9) adds, as clearly separated sections:
 * the Stage 1 (Recommend Agent) and Stage 2 (Policy Agent) blocks, and the
 * always-shown Policy Decision sidebar card. No Stage 3 (Execute) block —
 * out of scope here (79.4).
 */

const VERDICT_LABEL: Record<string, string> = {
  auto_permitted: "Auto-permitted",
  needs_analyst: "Needs analyst review",
  needs_manager: "Needs manager review",
  blocked: "Blocked",
};

function verdictLabel(verdict: string | undefined): string {
  if (verdict === undefined) return "Unknown";
  return VERDICT_LABEL[verdict] ?? verdict;
}

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
  /** Stage 2 (TKT-75.03): `undefined` while loading, `null` not yet evaluated. */
  policyDecision?: PolicyDecisionRow | null | undefined;
  /** Why Stage 2 couldn't evaluate (missing bank line, rejected evaluation,
   * failed write) — shown instead of "Not yet evaluated." (fix r1 m2). */
  policyError?: string | null;
  /** The stored decision's inputs no longer match the exception's: it's hidden
   * while Policy re-evaluates, so a stale verdict is never shown (fix r1 M2). */
  policyStale?: boolean;
}

export function ExceptionDetailContent({
  detail,
  selected,
  onSelect,
  permission,
  busy,
  onSubmit,
  policyDecision,
  policyError = null,
  policyStale = false,
}: ExceptionDetailContentProps) {
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
          {payment && <RecommendAgentBlock recommendation={detail.recommendation} />}
          {payment && (
            <PolicyAgentBlock policyDecision={policyDecision} error={policyError} stale={policyStale} closed={x.status !== "open"} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {payment && (
            <PolicyDecisionCard policyDecision={policyDecision} error={policyError} stale={policyStale} closed={x.status !== "open"} />
          )}
          <AuditTrail events={detail.audit} />
        </div>
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

/**
 * Stage 1 (Design-TASK-75 §4): the Recommend agent's verified claims, each
 * with a source reference, plus its recommendation text and confidence.
 * `undefined` recommendation means the exception kind isn't payment-shaped
 * (no Stage 1 to show); `!ok` is the F13 cannot-recommend case.
 */
function RecommendAgentBlock({ recommendation }: { recommendation: ExceptionDetail["recommendation"] }) {
  if (recommendation === undefined) return null;
  return (
    <section className={CARD} aria-labelledby="stage-recommend" data-testid="stage-recommend">
      <h2 id="stage-recommend" className="font-semibold text-text">
        1. Recommend Agent
      </h2>
      {recommendation.ok ? (
        <>
          <ul className="flex flex-col gap-1 text-sm text-text">
            {recommendation.value.facts.map((f) => (
              <li key={f.claimId} className="flex min-w-0 flex-wrap items-baseline gap-2">
                <span>{f.value}</span>
                <span className={PROVENANCE}>Source: {f.evidenceId}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-text">{recommendation.value.recommendation_text}</p>
          <p className="text-xs text-text-muted">
            Confidence: {recommendation.value.confidence === "high" ? "high (exact match)" : "low (ambiguous match)"}
          </p>
        </>
      ) : (
        <p className="text-sm text-text-muted">Cannot recommend: {recommendation.error.reason}</p>
      )}
    </section>
  );
}

/**
 * Stage 2 (Design-TASK-75 §4): the Policy agent's verdict + reason +
 * config_version — "no raw gate list, just the outcome and why".
 * `undefined` means the Policy evaluation is still loading; `null` means
 * it hasn't run yet for this exception.
 */
interface PolicyStateProps {
  policyDecision: PolicyDecisionRow | null | undefined;
  error: string | null;
  stale: boolean;
  closed: boolean;
}

/**
 * The non-verdict Stage 2 states, shared by the Stage block and the sidebar
 * card. Returns `null` when there's a current decision to render. Precedence:
 * error → stale (re-evaluating) → loading → none. A closed exception with no
 * decision intentionally never gets one (`policyInputsFor`), so it says so
 * rather than "Not yet evaluated." forever (fix r1 m2).
 */
function PolicyState({ policyDecision, error, stale, closed, testid }: PolicyStateProps & { testid?: string }) {
  if (error !== null) {
    return (
      <p role="alert" className="rounded-md bg-high-bg px-3 py-2 text-sm text-high" data-testid={testid}>
        Policy couldn’t evaluate: {error}
      </p>
    );
  }
  if (stale) return <p className="text-sm text-text-muted">Re-evaluating — the inputs changed since the last decision…</p>;
  if (policyDecision === undefined) return <p className="text-sm text-text-muted">Evaluating…</p>;
  if (policyDecision === null) {
    return (
      <p className="text-sm text-text-muted">
        {closed ? "Not evaluated — this exception was closed before Policy ran." : "Not yet evaluated."}
      </p>
    );
  }
  return null;
}

function PolicyAgentBlock(props: PolicyStateProps) {
  const { policyDecision: row } = props;
  const policyDecision = props.error === null && !props.stale ? row : null;
  return (
    <section className={CARD} aria-labelledby="stage-policy" data-testid="stage-policy">
      <h2 id="stage-policy" className="font-semibold text-text">
        2. Policy Agent
      </h2>
      <PolicyState {...props} testid="policy-error" />
      {policyDecision && (
        <>
          <p className="text-sm text-text">
            Policy verdict: {verdictLabel(policyDecision.verdict)}
            {policyDecision.reason ? ` — ${policyDecision.reason}` : ""}
          </p>
          <p className="text-xs text-text-muted">
            Policy version: {policyDecision.config_version ?? "—"} · Evaluated at:{" "}
            {typeof policyDecision.evaluated_at === "string" ? formatDateTime(policyDecision.evaluated_at) : "—"}
          </p>
          {policyDecision.model_policy_conflict && (
            <p className="text-sm text-amber-700" data-testid="policy-conflict">
              Recommend and Policy disagreed — the Policy verdict governs (FS22).
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Policy Decision sidebar card (Design-TASK-75 §9): `POL-{id}`, always
 * shown, even before any Execute action — a `detail-card` with the verdict,
 * one-line reason, decision id, policy version and evaluation timestamp.
 */
function PolicyDecisionCard(props: PolicyStateProps) {
  const { policyDecision: row } = props;
  const policyDecision = props.error === null && !props.stale ? row : null;
  return (
    <section className={cn(CARD, "h-fit")} aria-labelledby="policy-decision-card" data-testid="policy-decision-card">
      <h2 id="policy-decision-card" className="font-semibold text-text">
        Policy Decision
      </h2>
      <PolicyState {...props} />
      {policyDecision && (
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-text-muted">Verdict</dt>
          <dd className="text-text">{verdictLabel(policyDecision.verdict)}</dd>
          <dt className="text-text-muted">Reason</dt>
          <dd className="text-text">{policyDecision.reason ?? "—"}</dd>
          <dt className="text-text-muted">Decision ID</dt>
          <dd className="break-all font-mono text-[11px] text-text-muted">{policyDecision.decision_id}</dd>
          <dt className="text-text-muted">Policy version</dt>
          <dd className="text-[11px] text-text-muted">{policyDecision.config_version ?? "—"}</dd>
          <dt className="text-text-muted">Evaluated</dt>
          <dd className="text-[11px] text-text-muted">
            {typeof policyDecision.evaluated_at === "string" ? formatDateTime(policyDecision.evaluated_at) : "—"}
          </dd>
        </dl>
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
