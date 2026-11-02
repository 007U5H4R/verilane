"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";

import type { DisputeCase } from "@/domain/disputes/listing";
import { ownerLabel } from "@/domain/disputes/model";
import { formatInr, paise } from "@/domain/money";
import type { PaymentClaim } from "@/domain/schema";
import { AgePill, Field, StatusPill } from "./DisputeBits";
import { DISPUTE_TYPE_LABELS } from "./DisputeLabels";

const NOT_RECORDED = "Not recorded in source data";
const money = (p: number) => formatInr(paise(p));
const claimText = (c: PaymentClaim) =>
  `${c.amount_paise === null ? "amount not stated" : money(c.amount_paise)} on ${c.paid_on ?? "date not stated"}`;

/**
 * Why a person must look before anything is decided: no valid extraction,
 * no confident invoice match, no ledger invoice, or an unspecified type.
 * Empty when the evidence is complete enough to act on.
 */
export function evidenceGaps(c: DisputeCase): string[] {
  const gaps: string[] = [];
  if (!c.extraction) gaps.push("No AI reading of the customer’s email is on record.");
  else if (c.extraction.status === "rejected") gaps.push("The AI reading of the email was rejected by validation.");
  if (c.dispute.source_message_id && c.match && c.match.outcome !== "matched")
    gaps.push(`The email could not be matched to one invoice (${c.match.outcome.replace(/_/g, " ")}).`);
  if (!c.invoice) gaps.push("No ledger invoice is linked to this dispute.");
  if (c.dispute.type === "unknown") gaps.push("The type of dispute is not clear from the email.");
  return gaps;
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * The full picture of one dispute (TASK-38): overview, the customer's
 * email unchanged, the labelled AI reading, an evidence table with a source
 * per value, the recommendation with its basis, and the audit timeline.
 * Shared by the list drawer and `/disputes/[id]`. `primary` adds the
 * detail page's test ids (the drawer omits them so ids stay unique).
 */
export function DisputeInvestigation({ item, primary = false }: { item: DisputeCase; primary?: boolean }) {
  const { dispute, email, extraction, match, invoice } = item;
  const gaps = evidenceGaps(item);
  const tid = (id: string) => (primary ? { "data-testid": id } : {});

  return (
    <div className="flex flex-col gap-4">
      {gaps.length > 0 && (
        <div
          role="note"
          className="flex gap-3 rounded-xl border border-med bg-med-bg p-4 text-sm text-text"
          data-testid="dispute-insufficient-evidence"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-med" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">Insufficient evidence — human review required.</p>
            <ul className="list-disc pl-4 text-text-muted">
              {gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Dispute" mono>
            {dispute.dispute_id}
          </Field>
          <Field label="Status">
            <StatusPill status={dispute.status} {...tid("dispute-status")} />
          </Field>
          <Field label="Type">{DISPUTE_TYPE_LABELS[dispute.type]}</Field>
          <Field label="Customer">{item.customerName}</Field>
          <Field label="Invoice" mono>
            {invoice ? (
              <Link href={`/invoices/${invoice.invoice_id}`} className="text-brand-strong underline">
                {item.invoiceLabel}
              </Link>
            ) : (
              item.invoiceLabel
            )}
          </Field>
          <Field label="Amount in dispute">
            <span className="tabular-nums">{item.amountPaise === null ? "—" : money(item.amountPaise)}</span>
            {item.amountNote && <span className="block text-xs text-text-muted">{item.amountNote}</span>}
          </Field>
          <Field label="Age">
            <AgePill age={item.age} />
          </Field>
          <Field label="Raised" mono>
            {item.createdAt ? item.createdAt.slice(0, 10) : "Unknown"}
          </Field>
          <Field label="Owner">{ownerLabel(dispute.assigned_reviewer)}</Field>
        </dl>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-muted">What the customer is disputing</p>
          <p className="text-sm text-text" {...tid("dispute-claim-text")}>
            {dispute.claim_text}
          </p>
        </div>
      </Section>

      <Section title="Original email" aside={<span className="text-xs text-text-muted">Shown exactly as received</span>}>
        {email ? (
          <>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <Field label="From" mono>
                {email.from_address}
              </Field>
              <Field label="To">{NOT_RECORDED}</Field>
              <Field label="Subject">{email.subject}</Field>
              <Field label="Sent" mono>
                {email.sent_at}
              </Field>
              <Field label="Record ID" mono>
                {email.message_id}
              </Field>
            </dl>
            <p className="font-mono text-xs text-text-muted" {...tid("dispute-provenance")}>
              {email.from_address} · {email.subject} · {email.sent_at.slice(0, 10)}
            </p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-sunken p-3 font-mono text-[13px] text-text">
              {email.body}
            </pre>
          </>
        ) : (
          <p className="text-sm text-text-muted">This dispute was opened by hand; there is no source email.</p>
        )}
      </Section>

      <Section
        title="AI interpretation"
        aside={
          <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
            <Sparkles aria-hidden className="size-3" />
            AI-generated · not verified
          </span>
        }
      >
        {extraction ? (
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <Field label="Read as">{extraction.email_class.replace(/_/g, " ")}</Field>
            <Field label="Dispute type">
              {extraction.dispute_type ? DISPUTE_TYPE_LABELS[extraction.dispute_type] : "Not identified"}
            </Field>
            <Field label="Invoices mentioned" mono>
              {extraction.invoice_refs.length ? extraction.invoice_refs.join(", ") : "None"}
            </Field>
            <Field label="Amounts mentioned">
              <span className="tabular-nums">
                {extraction.amounts.length ? extraction.amounts.map(money).join(", ") : "None"}
              </span>
            </Field>
            <Field label="Customer says they paid">
              {extraction.payment_claim
                ? `Yes — ${claimText(extraction.payment_claim)} (unverified claim)`
                : "No"}
            </Field>
            <Field label="Missing information">
              {extraction.missing_info.length ? extraction.missing_info.join(", ") : "None"}
            </Field>
            <Field label="Reader">
              {extraction.provider}
              {extraction.model ? ` · ${extraction.model}` : ""} ({extraction.mode})
            </Field>
            <Field label="Validation">
              {extraction.status === "valid" ? "Passed" : `Rejected — ${extraction.rejection_reason ?? "no reason given"}`}
            </Field>
          </dl>
        ) : (
          <p className="text-sm text-text-muted">No AI reading is on record for this dispute.</p>
        )}
      </Section>

      <Section title="Evidence">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="sr-only">Evidence for {dispute.dispute_id}, with the source of each value</caption>
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Item</th>
                <th scope="col" className="py-2 pr-3 font-medium">Value</th>
                <th scope="col" className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_tr]:border-b [&_tr]:border-border">
              <EvidenceRow item="Invoice amount" source="Invoice ledger">
                {invoice ? money(invoice.amount_paise) : "No ledger invoice"}
              </EvidenceRow>
              <EvidenceRow item="Invoice date / due" source="Invoice ledger">
                {invoice ? `${invoice.invoice_date} / ${invoice.due_date ?? "No due date"}` : "—"}
              </EvidenceRow>
              <EvidenceRow item="PO number" source="Invoice ledger">
                {invoice ? (invoice.po_number ?? "None on the invoice") : "—"}
              </EvidenceRow>
              <EvidenceRow item="Billing period" source="Invoice ledger">
                {invoice ? (invoice.billing_period ?? "None on the invoice") : "—"}
              </EvidenceRow>
              <EvidenceRow item="Payments received" source="Payments ledger">
                {item.ledgerPayments.length
                  ? item.ledgerPayments.map((p) => `${money(p.amount_paise)} on ${p.paid_on}`).join("; ")
                  : "None recorded"}
              </EvidenceRow>
              {item.paymentClaimed && (
                <EvidenceRow item="Payment the customer claims" source="Customer email — unverified">
                  {extraction?.payment_claim
                    ? claimText(extraction.payment_claim)
                    : "Claimed, no amount given"}
                </EvidenceRow>
              )}
              <EvidenceRow item="Email ↔ invoice match" source="Email matcher">
                {match ? `${match.outcome.replace(/_/g, " ")} — ${match.reason}` : "No match on record"}
              </EvidenceRow>
              <EvidenceRow item="Supporting document" source="—">
                Supporting document not available
              </EvidenceRow>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Recommended action" aside={<span className="text-xs text-text-muted">AI suggestion · a person decides</span>}>
        <p className="text-sm font-medium text-text" {...tid("dispute-recommendation")}>
          {dispute.ai_recommendation}
        </p>
        <p className="text-sm text-text-muted">
          <span className="font-medium text-text">Why: </span>
          {recommendationBasis(item)}
        </p>
      </Section>

      <Section title="Timeline">
        {item.events.length === 0 ? (
          <p className="text-sm text-text-muted">No actions have been recorded on this dispute yet.</p>
        ) : (
          <ol className="flex flex-col gap-3 border-l border-border pl-4">
            {item.events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="relative flex flex-col gap-0.5">
                <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-brand" />
                <span className="text-sm text-text">{e.summary ?? e.action.replace(/_/g, " ")}</span>
                <span className="font-mono text-xs text-text-muted">
                  {e.at.replace("T", " ").slice(0, 16)}
                  {e.actor_label ? ` · ${e.actor_label}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function EvidenceRow({ item, source, children }: { item: string; source: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="py-2 pr-3 align-top font-medium text-text">
        {item}
      </th>
      <td className="tabular-nums text-text">{children}</td>
      <td className="text-xs text-text-muted">{source}</td>
    </tr>
  );
}

/** The recorded basis for the recommendation — stored facts only, no new judgement. */
function recommendationBasis(c: DisputeCase): string {
  const parts: string[] = [`the customer’s claim reads as “${DISPUTE_TYPE_LABELS[c.dispute.type]}”`];
  if (c.match) parts.push(`the email ${c.match.outcome === "matched" ? "matched" : "did not match"} one invoice (${c.match.reason})`);
  if (c.paymentClaimed)
    parts.push(
      c.ledgerPayments.length
        ? "the ledger shows a payment against the invoice"
        : "the customer says they paid but no payment is in the ledger",
    );
  return `Based on ${parts.join("; ")}.`;
}
