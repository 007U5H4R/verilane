"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Badge } from "@/components/ui/badge";
import { DbContext, useDispute } from "@/store/hooks";
import { DISPUTE_STATUS_LABELS, DISPUTE_STATUS_VARIANT, DISPUTE_TYPE_LABELS } from "./DisputeLabels";

export function DisputeDetailSkeleton() {
  return (
    <div className="p-7">
      <RowSkeleton label="Loading dispute" rows={3} />
    </div>
  );
}

/**
 * Dispute detail (TASK-17.3, Design.md §14): claim text, email provenance
 * and AI recommendation for one dispute. No `generateStaticParams` (dispute
 * ids only exist in the browser's IndexedDB), so the id is read
 * client-side with `useParams()` inside `<Suspense>`.
 */
export function DisputeDetailView() {
  const { id } = useParams<{ id: string }>();
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  if (forced === "loading") return <DisputeDetailSkeleton />;
  if (forced === "error" || !db) {
    return (
      <div className="p-7">
        <DisputeError onRetry={() => window.location.reload()} />
      </div>
    );
  }
  return (
    <div className="p-7">
      <DisputeBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <DisputeBody id={id} />
      </DisputeBoundary>
    </div>
  );
}

function DisputeBody({ id }: { id: string }) {
  const found = useDispute(id);
  if (found === undefined) return <DisputeDetailSkeleton />;
  if (found === null) {
    return (
      <div data-state="not-found" className="flex flex-col gap-2">
        <p className="text-text">Dispute not found.</p>
        <Link href="/disputes" className="text-sm text-brand-strong underline">
          ← Back to disputes
        </Link>
      </div>
    );
  }

  const { dispute, customer, invoice, email } = found;
  return (
    <div className="flex flex-col gap-4" data-state="working">
      <Link href="/disputes" className="text-sm text-brand-strong underline">
        ← Back to disputes
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={DISPUTE_STATUS_VARIANT[dispute.status]} data-testid="dispute-status">
          {DISPUTE_STATUS_LABELS[dispute.status]}
        </Badge>
        <span className="text-xs text-text-muted">{DISPUTE_TYPE_LABELS[dispute.type]}</span>
      </div>
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
          {customer?.name ?? dispute.customer_id}
        </h1>
        {invoice && (
          <Link href={`/invoices/${invoice.invoice_id}`} className="font-mono text-sm text-text-muted underline">
            {invoice.invoice_number ?? invoice.invoice_id}
          </Link>
        )}
      </div>
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text">Claim</h2>
        <p className="text-[13px] text-text-muted" data-testid="dispute-claim-text">
          {dispute.claim_text}
        </p>
      </section>
      {email && (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-text">Source email</h2>
          <p className="font-mono text-xs text-text-muted" data-testid="dispute-provenance">
            {email.from_address} · {email.subject} · {email.sent_at.slice(0, 10)}
          </p>
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text">AI recommendation</h2>
        <p className="text-[13px] text-text-muted" data-testid="dispute-recommendation">
          {dispute.ai_recommendation}
        </p>
      </section>
    </div>
  );
}

function DisputeError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Couldn’t load this dispute." onRetry={onRetry} />;
}

class DisputeBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] dispute detail failed to load", error);
  }
  render() {
    return this.state.failed ? <DisputeError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
