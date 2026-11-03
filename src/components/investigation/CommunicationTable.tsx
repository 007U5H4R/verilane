"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buildEmailEvidence, emailFactLabel } from "@/domain/evidence";
import { formatInr, paise } from "@/domain/money";
import { cn } from "@/lib/cn";
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
  const evidence = buildEmailEvidence(extraction);
  // R18: G4/G5 reasons cite `<message_id>:emails.json:email_class`, so the
  // class badge is that evidence's anchor and carries its provenance line.
  const classEvidence = evidence.find((ev) => ev.source_field === "email_class");
  const facts = evidence.filter((ev) => ev.source_field !== "email_class");
  return (
    <article
      data-testid="communication-message"
      data-thread={email.thread_id}
      className="border-b border-border py-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge
          id={classEvidence && `ev-${classEvidence.evidence_id}`}
          data-testid="email-class"
          variant={CLASS_VARIANT[extraction.email_class]}
          // T34-2: a deep link lands with room above it and rings the cited
          // badge in the focus colour. `:target` alone misses a badge rendered
          // after the fragment navigation, so the landing effect also marks it
          // `data-landed`.
          className={cn(
            "scroll-mt-4",
            "target:ring-2 target:ring-brand target:ring-offset-2 target:ring-offset-canvas",
            "data-landed:ring-2 data-landed:ring-brand data-landed:ring-offset-2 data-landed:ring-offset-canvas",
          )}
        >
          {CLASS_LABEL[extraction.email_class]}
        </Badge>
        <span className="min-w-0 truncate text-[13px] font-medium text-text">{email.subject}</span>
      </header>
      {classEvidence && <ProvenanceLine evidence={classEvidence} />}
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
  // The messages arrive after the browser has tried the URL's `#ev-…`
  // fragment, so once they render, land on it (once — live updates mustn't
  // yank the scroll position back). Once per invoice (T34-3): if the table is
  // reused for another invoice, that invoice's deep link must land too.
  const landed = useRef<string | null>(null);
  useEffect(() => {
    if (landed.current === invoiceId || messages === undefined) return;
    landed.current = invoiceId;
    let id: string;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const target = id.startsWith("ev-") ? document.getElementById(id) : null;
    if (!target) return;
    target.setAttribute("data-landed", "");
    // TASK-49 DES-003: the top bar is sticky, so a bare scrollIntoView tucks
    // the badge under it (101px at 375, where the bar wraps to two rows).
    // Clear the bar's real height, measured now, plus a small gap.
    const bar = document.querySelector("header.topbar-wave");
    const barBottom = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
    target.style.scrollMarginTop = `${Math.ceil(barBottom) + 12}px`;
    target.scrollIntoView({ block: "start" });
  }, [messages, invoiceId]);
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
