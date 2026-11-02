"use client";

import Link from "next/link";
import { ArrowUpRight, Bot, Mail } from "lucide-react";

import { DISPUTE_STATUS_LABELS, DISPUTE_STATUS_VARIANT, DISPUTE_TYPE_LABELS } from "@/components/disputes/DisputeLabels";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/domain/clock";
import { resolveInvoiceRefs, type EmailThread, type ThreadMessage } from "@/domain/emails/threads";
import { formatInr, paise } from "@/domain/money";
import type { Extraction, Invoice, ReviewItem } from "@/domain/schema";
import { CLASS_LABEL, CLASS_VARIANT, OUTCOME_LABEL, OUTCOME_VARIANT, REVIEW_KIND_LABEL, SIGNAL_LABEL } from "./labels";

const NA = "Not available.";
const LINK = "rounded text-brand-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Where a review item is worked: reconciliation and uncertain matches live on Payments; the rest on their invoice. */
function reviewHref(r: ReviewItem): string | null {
  if (r.kind === "reconciliation") return "/payments#payments-reconcile";
  if (r.kind === "uncertain_match") return "/payments#payments-unmatched";
  return r.invoice_id ? `/invoices/${encodeURIComponent(r.invoice_id)}#ev-communication` : null;
}

const invoiceHref = (id: string) => `/invoices/${encodeURIComponent(id)}#ev-communication`;

/**
 * One conversation, read-only (TASK-38): every message verbatim (sender,
 * time, plain-text body), the stored AI extraction for it labelled as an
 * interpretation, the match outcome, and links to what it raised. The data
 * has no recipient field, so no "to" line is shown. Nothing here sends.
 */
export function ThreadDetail({ thread, invoices }: { thread: EmailThread; invoices: Invoice[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="email-thread-detail">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">Customer</dt>
        <dd className="min-w-0 text-text">
          {thread.customerName ?? NA}
          {thread.customer_id && <span className="ml-2 font-mono text-xs text-text-muted">{thread.customer_id}</span>}
        </dd>
        <dt className="text-text-muted">Thread</dt>
        <dd className="font-mono text-xs leading-5 text-text">{thread.thread_id}</dd>
        <dt className="text-text-muted">Messages</dt>
        <dd className="text-text tabular-nums">{thread.messages.length}</dd>
      </dl>

      <Related thread={thread} />

      <section aria-labelledby="thread-messages-title" className="flex flex-col gap-3">
        <h3 id="thread-messages-title" className="text-sm font-semibold text-text">
          Messages, oldest first
        </h3>
        <ol className="flex flex-col gap-4">
          {thread.messages.map((m) => (
            <li key={m.email.message_id}>
              <MessageCard message={m} invoices={invoices} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Related({ thread }: { thread: EmailThread }) {
  const reviews = thread.messages.flatMap((m) => m.reviews);
  const empty = thread.invoices.length === 0 && thread.candidates.length === 0 && thread.disputes.length === 0 && reviews.length === 0;
  return (
    <section aria-labelledby="thread-related-title" className="flex flex-col gap-2 rounded-xl border border-border bg-surface-sunken p-3">
      <h3 id="thread-related-title" className="text-sm font-semibold text-text">
        Linked records
      </h3>
      {empty ? (
        <p className="text-sm text-text-muted">No invoice, dispute or review item is linked to this conversation.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm" data-testid="email-related">
          {thread.invoices.map((i) => (
            <li key={`inv-${i.invoice_id}`} className="flex flex-wrap items-center gap-x-2">
              <span className="text-text-muted">Invoice</span>
              <Link href={invoiceHref(i.invoice_id)} className={`${LINK} inline-flex min-h-11 items-center gap-1 font-mono lg:min-h-0`}>
                {i.label}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </li>
          ))}
          {thread.candidates.map((i) => (
            <li key={`cand-${i.invoice_id}`} className="flex flex-wrap items-center gap-x-2">
              <span className="text-text-muted">Candidate, not confirmed</span>
              <Link href={invoiceHref(i.invoice_id)} className={`${LINK} inline-flex min-h-11 items-center gap-1 font-mono lg:min-h-0`}>
                {i.label}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </li>
          ))}
          {thread.disputes.map((d) => (
            <li key={`d-${d.dispute_id}`} className="flex flex-wrap items-center gap-x-2">
              <span className="text-text-muted">Dispute</span>
              <Link href={`/disputes/${encodeURIComponent(d.dispute_id)}`} className={`${LINK} inline-flex min-h-11 items-center gap-1 font-mono lg:min-h-0`}>
                {d.dispute_id}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
              <span className="text-text-muted">{DISPUTE_TYPE_LABELS[d.type]}</span>
              <Badge variant={DISPUTE_STATUS_VARIANT[d.status]}>{DISPUTE_STATUS_LABELS[d.status]}</Badge>
            </li>
          ))}
          {reviews.map((r) => {
            const href = reviewHref(r);
            return (
              <li key={`r-${r.review_id}`} className="flex flex-wrap items-center gap-x-2">
                <span className="text-text-muted">{REVIEW_KIND_LABEL[r.kind]}</span>
                {href ? (
                  <Link href={href} className={`${LINK} inline-flex min-h-11 items-center gap-1 font-mono lg:min-h-0`}>
                    {r.review_id}
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </Link>
                ) : (
                  <span className="font-mono text-text">{r.review_id}</span>
                )}
                <Badge variant={r.status === "open" ? "med" : "outline"}>{r.status === "open" ? "Open" : r.status === "actioned" ? "Actioned" : "Dismissed"}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MessageCard({ message, invoices }: { message: ThreadMessage; invoices: Invoice[] }) {
  const { email, extraction, match } = message;
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-card sm:p-4"
      aria-label={`Message ${email.message_id}`}
      data-testid="email-message"
    >
      <header className="flex flex-col gap-0.5">
        <p className="flex min-w-0 items-center gap-2 text-sm text-text">
          <Mail aria-hidden className="size-4 shrink-0 text-text-muted" />
          <span className="text-text-muted">From</span>
          <span className="min-w-0 break-all font-medium">{email.from_address}</span>
        </p>
        <p className="text-xs text-text-muted">
          <time dateTime={email.sent_at}>{formatDateTime(email.sent_at)}</time>
          <span className="font-mono"> · {email.message_id}</span>
        </p>
        <p className="text-sm font-semibold text-text">{email.subject}</p>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text" data-testid="email-body">
        {email.body}
      </p>
      <Interpretation extraction={extraction} invoices={invoices} />
      <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-text-muted">Invoice match</span>
          {match ? <Badge variant={OUTCOME_VARIANT[match.outcome]}>{OUTCOME_LABEL[match.outcome]}</Badge> : <span className="text-text">{NA}</span>}
        </p>
        {match && <p className="text-[13px] text-text-muted">{match.reason}</p>}
      </div>
    </article>
  );
}

function Interpretation({ extraction: x, invoices }: { extraction?: Extraction; invoices: Invoice[] }) {
  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-surface-sunken p-3"
      aria-label="AI interpretation"
      data-testid="email-interpretation"
    >
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <Bot aria-hidden className="size-4" />
        AI interpretation
        {x && (
          <span className="font-normal normal-case tracking-normal">
            · {x.mode === "live" ? "Live" : "Simulated"}
            {x.provider && x.provider.toLowerCase() !== x.mode ? ` · ${x.provider}` : ""}
            {x.model ? ` · ${x.model}` : ""}
          </span>
        )}
      </p>
      {!x ? (
        <p className="text-sm text-text">{NA}</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-text-muted">Status</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge variant={x.status === "valid" ? "low" : "high"}>{x.status === "valid" ? "Valid" : "Rejected"}</Badge>
            {x.rejection_reason && <span className="text-text-muted">{x.rejection_reason}</span>}
          </dd>
          <dt className="text-text-muted">Intent</dt>
          <dd>
            <Badge variant={CLASS_VARIANT[x.email_class]}>{CLASS_LABEL[x.email_class]}</Badge>
          </dd>
          <dt className="text-text-muted">Signals</dt>
          <dd className="text-text">{x.signals.length ? x.signals.map((s) => SIGNAL_LABEL[s]).join(", ") : NA}</dd>
          <dt className="text-text-muted">Invoice references</dt>
          <dd className="flex flex-wrap gap-x-3 gap-y-1">
            {x.invoice_refs.length === 0
              ? NA
              : resolveInvoiceRefs(x.invoice_refs, invoices).map(({ ref, invoice_id }) =>
                  invoice_id ? (
                    <Link key={ref} href={invoiceHref(invoice_id)} className={`${LINK} inline-flex min-h-11 items-center font-mono lg:min-h-0`}>
                      {ref}
                    </Link>
                  ) : (
                    <span key={ref} className="font-mono text-text" title="No invoice with this number is loaded">
                      {ref}
                    </span>
                  ),
                )}
          </dd>
          <dt className="text-text-muted">Amounts</dt>
          <dd className="text-text tabular-nums">{x.amounts.length ? x.amounts.map((a) => formatInr(paise(a))).join(", ") : NA}</dd>
          {x.commitment_date && (
            <>
              <dt className="text-text-muted">{x.email_class === "commitment" ? "Promised date" : "Date stated"}</dt>
              <dd className="text-text">{formatDate(x.commitment_date)}</dd>
            </>
          )}
          {x.payment_claim && (
            <>
              <dt className="text-text-muted">Payment claimed</dt>
              <dd className="text-text tabular-nums">
                {x.payment_claim.amount_paise === null ? "Amount not stated" : formatInr(paise(x.payment_claim.amount_paise))}
                {" · "}
                {x.payment_claim.paid_on ? `paid on ${formatDate(x.payment_claim.paid_on)}` : "date not stated"}
              </dd>
            </>
          )}
          {x.dispute_type && (
            <>
              <dt className="text-text-muted">Dispute type</dt>
              <dd className="text-text">{DISPUTE_TYPE_LABELS[x.dispute_type]}</dd>
            </>
          )}
          {x.missing_info.length > 0 && (
            <>
              <dt className="text-text-muted">Missing information</dt>
              <dd className="text-text">{x.missing_info.join(", ")}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
