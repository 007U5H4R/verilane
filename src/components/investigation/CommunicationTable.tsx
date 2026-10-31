"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buildEmailEvidence, emailFactLabel } from "@/domain/evidence";
import { formatInr, paise } from "@/domain/money";
import type { EmailClass, Evidence, Extraction } from "@/domain/schema";
import { useInvoiceCommunication, type InvoiceMessage } from "@/store/hooks";
import { formatDate } from "./DocumentCard";
import { ProvenanceLine } from "./ProvenanceLine";

const CLASS_LABEL: Record<EmailClass, string> = {
  commitment: "Commitment",
  confirmation: "Payment claimed",
  dispute: "Dispute",
  duplicate: "Duplicate",
  delay: "Delay",
  enquiry: "Enquiry",
  unknown: "Unclassified",
};

const CLASS_VARIANT: Record<EmailClass, "default" | "high" | "med" | "low" | "disp" | "outline"> = {
  commitment: "low",
  confirmation: "low",
  dispute: "disp",
  duplicate: "disp",
  delay: "med",
  enquiry: "default",
  unknown: "outline",
};

/** Small-type marker on AI-authored content (SR5, Design.md §139/§303). */
function SimulatedLabel() {
  return (
    <span data-testid="simulated-label" className="text-xs text-text-muted">
      Simulated
    </span>
  );
}

function factValue(ev: Evidence, x: Extraction): ReactNode {
  const v = ev.original_value;
  const field = ev.source_field.replace(/\[\d+\]$/, "");
  switch (field) {
    case "email_class":
      return CLASS_LABEL[x.email_class];
    case "amounts":
      return <span className="tabular-nums">{formatInr(paise(Number(v)))}</span>;
    case "commitment_date":
      return formatDate(String(v));
    case "invoice_refs":
      return <span className="font-mono">{String(v)}</span>;
    case "dispute_type":
      return String(v).replace(/_/g, " ");
    case "status":
      return <Badge variant="high">Rejected</Badge>;
    default:
      return String(v);
  }
}

function Message({ email, extraction }: InvoiceMessage) {
  const facts = buildEmailEvidence(extraction).filter((ev) => ev.source_field !== "email_class");
  return (
    <article
      data-testid="communication-message"
      data-thread={email.thread_id}
      className="border-b border-border py-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge data-testid="email-class" variant={CLASS_VARIANT[extraction.email_class]}>
          {CLASS_LABEL[extraction.email_class]}
        </Badge>
        <span className="min-w-0 truncate text-[13px] font-medium text-text">{email.subject}</span>
      </header>
      <p className="mt-1 break-words text-xs text-text-muted">
        {email.from_address} · {formatDate(email.sent_at.slice(0, 10))} ·{" "}
        <span className="font-mono">{email.thread_id}</span>
      </p>
      {facts.length > 0 && (
        <table className="mt-2 w-full border-collapse text-[13px] max-md:block">
          <tbody className="max-md:block">
            {facts.map((ev) => (
              <tr key={ev.evidence_id} data-field={ev.source_field} className="max-md:block max-md:py-1.5">
                <th
                  scope="row"
                  className="py-1.5 pr-4 text-left align-top font-medium text-text-muted max-md:block max-md:p-0 md:w-[38%]"
                >
                  {emailFactLabel(ev.source_field, extraction)}
                </th>
                <td className="py-1.5 align-top text-text break-words max-md:block max-md:pb-0 max-md:pt-0.5">
                  {factValue(ev, extraction)}
                  <ProvenanceLine evidence={ev} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

/**
 * The Communication evidence group (TASK-12.6, Design.md §13): each message
 * citing this invoice, its simulated class, and the facts extracted from it,
 * each traced to `emails.json · <thread> · <token path>`. FS9: none → an
 * explicit "No prior communication".
 */
export function CommunicationTable({ invoiceId }: { invoiceId: string }) {
  const messages = useInvoiceCommunication(invoiceId);
  return (
    <section className="mt-5" aria-labelledby="ev-communication" aria-busy={messages === undefined}>
      <h2 id="ev-communication" className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-text">
        Communication
        {messages && messages.length > 0 && <SimulatedLabel />}
      </h2>
      {messages === undefined ? (
        <div className="h-9 animate-pulse rounded bg-surface-sunken" />
      ) : messages.length === 0 ? (
        <p data-testid="no-communication" className="text-[13px] text-text-muted">
          No prior communication
        </p>
      ) : (
        messages.map((m) => <Message key={m.email.message_id} {...m} />)
      )}
    </section>
  );
}
