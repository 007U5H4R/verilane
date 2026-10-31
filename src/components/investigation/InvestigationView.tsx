"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { buildInvoiceEvidence, INVOICE_FACT_LABELS } from "@/domain/evidence";
import { formatInr, paise } from "@/domain/money";
import { outstandingOf } from "@/domain/priority";
import type { Evidence } from "@/domain/schema";
import { useCustomers, useInvoice, usePayments } from "@/store/hooks";
import { DocumentCard, formatDate } from "./DocumentCard";
import { EvidenceTable } from "./EvidenceTable";
import { PriorityReason } from "./PriorityReason";

function factValue(ev: Evidence): ReactNode {
  const v = ev.original_value;
  if (v === null || v === undefined) return <span className="text-text-muted">—</span>;
  switch (ev.source_field) {
    case "amount_paise":
      return <span className="tabular-nums">{formatInr(paise(Number(v)))}</span>;
    case "invoice_date":
    case "due_date":
      return formatDate(String(v));
    case "invoice_number":
      return <span className="font-mono">{String(v)}</span>;
    default:
      return String(v);
  }
}

function BackToQueue() {
  return (
    <a href="/queue" className="text-sm text-brand hover:underline">
      ← Back to queue
    </a>
  );
}

/** Loading state: skeleton document card + evidence table (Design.md §17). */
export function InvestigationSkeleton() {
  return (
    <div className="p-7" aria-busy="true" aria-label="Loading invoice">
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="h-5 w-24 animate-pulse rounded-full bg-surface-sunken" />
        <div className="mt-3 h-8 w-64 max-w-full animate-pulse rounded bg-surface-sunken" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-surface-sunken" />
        <div className="mt-5 h-16 animate-pulse rounded-md bg-surface-sunken" />
        <div className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-surface-sunken" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Investigation (TASK-7.9): one invoice, why it's prioritised, and the
 * evidence behind it — each fact traced to its CSV row + column. Reads the
 * invoice id client-side via `useParams` (the page is a static shell; the
 * data lives in IndexedDB).
 */
export function InvestigationView() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = decodeURIComponent(id);
  const found = useInvoice(invoiceId);
  const customers = useCustomers();
  const payments = usePayments();

  if (found === undefined || !customers || !payments) return <InvestigationSkeleton />;

  if (found === null) {
    return (
      <div className="p-7">
        <h1 className="font-display text-2xl font-semibold text-text">Invoice not found</h1>
        <p className="mt-2 text-text-muted">
          No invoice <span className="font-mono">{invoiceId}</span> in the loaded data.
        </p>
        <p className="mt-4">
          <BackToQueue />
        </p>
      </div>
    );
  }

  const { invoice, priority } = found;
  const facts = buildInvoiceEvidence(invoice, invoice.row_id);

  return (
    <div className="p-7">
      <p className="mb-4">
        <BackToQueue />
      </p>
      <DocumentCard
        invoice={invoice}
        priority={priority}
        customer={customers.get(invoice.customer_id)}
        outstandingPaise={outstandingOf(invoice, { payments })}
      >
        <PriorityReason priority={priority} />
        <EvidenceTable
          title="Invoice facts"
          rows={facts.map((ev) => ({
            label: INVOICE_FACT_LABELS[ev.source_field] ?? ev.source_field,
            value: factValue(ev),
            evidence: ev,
          }))}
        />
      </DocumentCard>
    </div>
  );
}
