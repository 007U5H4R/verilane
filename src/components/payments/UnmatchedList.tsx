import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatInr, paise } from "@/domain/money";
import type { EmailMessage, Invoice, Match, ReviewItem } from "@/domain/schema";

const OUTCOME_LABEL: Record<Match["outcome"], string> = {
  matched: "Matched",
  ambiguous: "Ambiguous",
  customer_only: "Customer only",
  unresolved: "Unresolved sender",
};

const LINK = "font-medium text-brand hover:underline";

/**
 * Review items the matcher raised (TASK-13.4): each names its email and the
 * invoice(s) it may concern, with links to both. The ledger is never changed
 * here — a person decides.
 */
export function UnmatchedList({
  items,
  emails,
  matches,
  invoices,
  label,
  emptyText,
}: {
  items: ReviewItem[];
  emails: Map<string, EmailMessage>;
  matches: Map<string, Match>;
  invoices: Map<string, Invoice>;
  label: string;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-border bg-surface p-4 text-[13px] text-text-muted">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col rounded-lg border border-border bg-surface px-4" aria-label={label}>
      {items.map((item) => (
        <Item key={item.review_id} item={item} email={emails.get(item.message_id)} match={matches.get(item.message_id)} invoices={invoices} />
      ))}
    </ul>
  );
}

function Item({
  item,
  email,
  match,
  invoices,
}: {
  item: ReviewItem;
  email: EmailMessage | undefined;
  match: Match | undefined;
  invoices: Map<string, Invoice>;
}) {
  const invoiceIds = item.invoice_id ? [item.invoice_id] : (match?.candidates ?? []);
  // The email shows in the Communication section of an invoice it cites.
  const emailInvoice = invoiceIds[0];
  const kindLabel = item.kind === "reconciliation" ? "Reconciliation" : OUTCOME_LABEL[match?.outcome ?? "unresolved"];
  const numberOf = (id: string) => invoices.get(id)?.invoice_number ?? id;

  return (
    <li data-testid="review-item" data-kind={item.kind} data-message={item.message_id} className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.validation_status === "conflict" ? "high" : "med"}>{kindLabel}</Badge>
        <span className="min-w-0 text-[13px] font-medium text-text">{item.escalation_reason}</span>
      </div>

      <p className="text-xs text-text-muted">
        Email{" "}
        {emailInvoice ? (
          <Link href={`/invoices/${emailInvoice}#ev-communication`} className={`font-mono ${LINK}`} aria-label={`Open email ${item.message_id}`}>
            {item.message_id}
          </Link>
        ) : (
          <span className="font-mono text-text">{item.message_id}</span>
        )}
        {email && (
          <>
            {" · "}
            <span className="text-text">{email.subject}</span>
            {" · "}
            {email.from_address}
          </>
        )}
      </p>

      <p className="text-xs text-text-muted">
        {item.invoice_id ? "Invoice " : invoiceIds.length > 0 ? "Possible invoices " : "No invoice identified"}
        {invoiceIds.map((id, i) => (
          <span key={id}>
            {i > 0 && ", "}
            <Link href={`/invoices/${id}`} className={LINK}>
              {numberOf(id)}
            </Link>
          </span>
        ))}
      </p>

      {item.kind === "reconciliation" && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          {item.email_amount_paise !== undefined && (
            <div className="flex gap-1.5">
              <dt className="text-text-muted">Email says paid</dt>
              <dd data-testid="email-amount" className="tabular-nums text-text">{formatInr(paise(item.email_amount_paise))}</dd>
            </div>
          )}
          {item.ledger_outstanding_paise !== undefined && (
            <div className="flex gap-1.5">
              <dt className="text-text-muted">Ledger outstanding</dt>
              <dd data-testid="ledger-amount" className="tabular-nums text-text">{formatInr(paise(item.ledger_outstanding_paise))}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="text-xs text-text-muted">
        {item.recommendation} · {item.requires_role === "manager" ? "Manager" : "Analyst"} review
      </p>
    </li>
  );
}
