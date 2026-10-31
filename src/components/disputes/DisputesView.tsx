"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DbContext, useDisputes, type DisputeWithContext } from "@/store/hooks";
import { DISPUTE_STATUS_LABELS, DISPUTE_STATUS_VARIANT, DISPUTE_TYPE_LABELS } from "./DisputeLabels";

/**
 * Disputes (TASK-17.3, Design.md §14): every Dispute row with its claim
 * text, email provenance and AI recommendation. Four states: loading,
 * empty, error, working. Must render inside <Suspense> (it reads search
 * params).
 */
export function DisputesView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  let body;
  if (forced === "loading") body = <RowSkeleton label="Loading disputes" />;
  else if (forced === "empty") body = <NoDisputes />;
  else if (forced === "error" || !db) body = <DisputesError onRetry={() => window.location.reload()} />;
  else
    body = (
      <DisputesBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <DisputesBody />
      </DisputesBoundary>
    );

  return (
    <section className="flex flex-col gap-4 p-7" aria-labelledby="disputes-title">
      <header className="flex flex-col gap-1">
        <h1 id="disputes-title" className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
          Disputes
        </h1>
        <p className="text-text-muted">What a customer is disputing, and what to do about it.</p>
      </header>
      {body}
    </section>
  );
}

function DisputesBody() {
  const disputes = useDisputes();
  if (!disputes) return <RowSkeleton label="Loading disputes" />;
  if (disputes.length === 0) return <NoDisputes />;

  return (
    <ul className="flex flex-col" data-state="working" data-testid="dispute-list">
      {disputes.map((d) => (
        <DisputeRow key={d.dispute.dispute_id} {...d} />
      ))}
    </ul>
  );
}

function DisputeRow({ dispute, customer, invoice, email }: DisputeWithContext) {
  return (
    <li className="border-b border-border py-3" data-testid="dispute-row">
      <Link href={`/disputes/${dispute.dispute_id}`} className="flex flex-col gap-1 rounded-md px-2 py-1 hover:bg-surface-sunken">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={DISPUTE_STATUS_VARIANT[dispute.status]}>{DISPUTE_STATUS_LABELS[dispute.status]}</Badge>
          <span className="text-sm font-medium text-text">{customer?.name ?? dispute.customer_id}</span>
          {invoice?.invoice_number && (
            <span className="font-mono text-xs text-text-muted">{invoice.invoice_number}</span>
          )}
          <span className="text-xs text-text-muted">{DISPUTE_TYPE_LABELS[dispute.type]}</span>
        </div>
        <p className="line-clamp-2 text-[13px] text-text-muted">{dispute.claim_text}</p>
        {email && (
          <p className="font-mono text-xs text-text-muted" data-testid="dispute-provenance">
            {email.from_address} · {email.subject}
          </p>
        )}
      </Link>
    </li>
  );
}

/**
 * No data yet. Loading or importing data lives in Settings (TASK-19), so
 * this state links there instead of running a loader itself.
 */
function NoDisputes() {
  return (
    <EmptyState
      title="No disputes yet"
      action={
        <Button asChild size="sm">
          <Link href="/settings#import">Load or import data</Link>
        </Button>
      }
    >
      Load the demo set or import your own CSV in Settings to see disputed invoices.
    </EmptyState>
  );
}

function DisputesError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Couldn’t load disputes." onRetry={onRetry} />;
}

class DisputesBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] disputes failed to load", error);
  }
  render() {
    return this.state.failed ? <DisputesError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
