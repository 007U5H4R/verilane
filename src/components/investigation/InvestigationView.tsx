"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCommand } from "@/components/useCommand";
import { MarkDisputedDialog } from "@/components/disputes/MarkDisputedDialog";
import { buildInvoiceEvidence, INVOICE_FACT_LABELS } from "@/domain/evidence";
import { formatInr, paise } from "@/domain/money";
import { outstandingOf } from "@/domain/priority";
import type { Evidence } from "@/domain/schema";
import type { CommandInput } from "@/store/tx";
import { ErrorState } from "@/components/states/ErrorState";
import {
  DbContext,
  useCustomers,
  useHasOpenDispute,
  useInvoice,
  useInvoiceDraft,
  usePayments,
  useRole,
} from "@/store/hooks";
import { ActionBar } from "./ActionBar";
import { ActivityLog } from "./ActivityLog";
import { ApproveDialog } from "./ApproveDialog";
import { ChecksPanel } from "./ChecksPanel";
import { CommunicationTable } from "./CommunicationTable";
import { DocumentCard, formatDate } from "./DocumentCard";
import { DraftPanel } from "./DraftPanel";
import { nextStep } from "./draftActions";
import { EvidenceTable } from "./EvidenceTable";
import { NextStepCallout } from "./NextStepCallout";
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

function BackToInvoices() {
  return (
    <Link href="/invoices" className="text-sm text-brand hover:underline">
      ← Back to invoices
    </Link>
  );
}

/** Loading state: skeleton document card + evidence table (Design.md §17). */
export function InvestigationSkeleton() {
  return (
    <div className="p-4 md:p-7" data-state="loading" aria-busy="true" role="status" aria-label="Loading invoice">
      <div className="rounded-lg border border-border bg-surface shadow-card p-6">
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
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  if (forced === "loading") return <InvestigationSkeleton />;
  // No DB (it failed to open) or a forced error: never a blank screen (TC-079).
  if (forced === "error" || !db) return <InvestigationError invoiceId={invoiceId} onRetry={() => window.location.reload()} />;
  return (
    <InvestigationBoundary key={attempt} invoiceId={invoiceId} onRetry={() => setAttempt((n) => n + 1)}>
      <InvestigationBody invoiceId={invoiceId} />
    </InvestigationBoundary>
  );
}

/** Design.md §18 error state: "Couldn't load INV-… + back to queue", plus Retry. */
function InvestigationError({ invoiceId, onRetry }: { invoiceId: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-7">
      <ErrorState message={`Couldn’t load ${invoiceId}.`} onRetry={onRetry} />
      <p>
        <BackToInvoices />
      </p>
    </div>
  );
}

class InvestigationBoundary extends Component<
  { children: ReactNode; invoiceId: string; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] investigation failed to load", error);
  }
  render() {
    return this.state.failed ? (
      <InvestigationError invoiceId={this.props.invoiceId} onRetry={this.props.onRetry} />
    ) : (
      this.props.children
    );
  }
}

function InvestigationBody({ invoiceId }: { invoiceId: string }) {
  const found = useInvoice(invoiceId);
  const customers = useCustomers();
  const payments = usePayments();
  const draft = useInvoiceDraft(invoiceId);
  const openDispute = useHasOpenDispute(invoiceId) ?? false;
  const role = useRole();
  const run = useCommand();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  async function command(cmd: CommandInput, after?: () => void) {
    if (!run || busy) return;
    setBusy(true);
    try {
      await run(cmd);
      after?.();
    } catch {
      // The refusal is shown as a toast by useCommand.
    } finally {
      setBusy(false);
    }
  }

  if (found === undefined || !customers || !payments) return <InvestigationSkeleton />;

  if (found === null) {
    return (
      <div className="p-4 md:p-7">
        <h1 className="font-display text-2xl font-semibold text-text">Invoice not found</h1>
        <p className="mt-2 text-text-muted">
          No invoice <span className="font-mono">{invoiceId}</span> in the loaded data.
        </p>
        <p className="mt-4">
          <BackToInvoices />
        </p>
      </div>
    );
  }

  const { invoice, priority } = found;
  const facts = buildInvoiceEvidence(invoice, invoice.row_id, found.dataIssues);

  return (
    <div className="p-4 md:p-7">
      <p className="mb-4">
        <BackToInvoices />
      </p>
      <ActionBar
        role={role}
        draft={draft}
        busy={busy}
        onEdit={() => setEditing(true)}
        onSubmit={() => {
          if (draft) void command({ type: "submit_draft", subject: { kind: "draft", id: draft.draft_id } });
        }}
        onApprove={draft ? () => setApproveOpen(true) : undefined}
        openDispute={openDispute}
        editing={editing}
        onMarkDisputed={() => setDisputeOpen(true)}
      />
      {draft ? (
        <ApproveDialog
          draftId={draft.draft_id}
          invoiceId={invoice.invoice_id}
          invoiceNumber={invoice.invoice_number}
          customerName={customers.get(invoice.customer_id)?.name ?? invoice.customer_id}
          amountPaise={draft.amount_paise}
          open={approveOpen}
          onOpenChange={setApproveOpen}
        />
      ) : null}
      <MarkDisputedDialog invoiceId={invoice.invoice_id} open={disputeOpen} onOpenChange={setDisputeOpen} />
      {draft !== undefined ? <NextStepCallout text={nextStep(role, draft)} /> : null}
      {/* Design.md §16: two columns at ≥1280px (evidence | activity), one below. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
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
          <CommunicationTable invoiceId={invoice.invoice_id} />
          <DraftPanel
            draft={draft}
            editing={editing}
            busy={busy}
            canRun={run !== null}
            onGenerate={() =>
              void command({ type: "generate_draft", subject: { kind: "invoice", id: invoice.invoice_id } })
            }
            onSave={(body) => {
              if (draft) {
                void command(
                  { type: "edit_draft", subject: { kind: "draft", id: draft.draft_id }, payload: { body } },
                  () => setEditing(false),
                );
              }
            }}
            onCancel={() => setEditing(false)}
          />
        </DocumentCard>
        <aside className="min-w-0">
          <ChecksPanel checks={draft === undefined ? undefined : (draft?.checks ?? null)} onEdit={() => setEditing(true)} />
          <ActivityLog invoiceId={invoice.invoice_id} />
        </aside>
      </div>
    </div>
  );
}
