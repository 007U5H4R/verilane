"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Button } from "@/components/ui/button";
import { DbContext, usePaymentsData } from "@/store/hooks";
import { LedgerTable } from "./LedgerTable";
import { UnmatchedList } from "./UnmatchedList";

/**
 * Payments (TASK-13.4): the payments ledger, plus the emails that need a
 * person — claimed payments to reconcile and emails the strict matcher could
 * not tie to one invoice. Four states: loading, empty, error, working.
 * Must render inside <Suspense> (it reads search params).
 */
export function PaymentsView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  let body;
  if (forced === "loading") body = <RowSkeleton label="Loading payments" />;
  else if (forced === "empty") body = <NoData />;
  else if (forced === "error" || !db) body = <PaymentsError onRetry={() => window.location.reload()} />;
  else
    body = (
      <PaymentsBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <PaymentsBody />
      </PaymentsBoundary>
    );

  return (
    <section className="flex flex-col gap-4 p-7" aria-labelledby="payments-title">
      <header className="flex flex-col gap-1">
        <h1 id="payments-title" className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
          Payments
        </h1>
        <p className="text-text-muted">The ledger, and the emails that need a person before anything changes.</p>
      </header>
      {body}
    </section>
  );
}

function PaymentsBody() {
  const data = usePaymentsData();
  if (!data) return <RowSkeleton label="Loading payments" />;
  if (data.invoices.size === 0) return <NoData />;

  const reconcile = data.reviewItems.filter((r) => r.kind === "reconciliation");
  const unmatched = data.reviewItems.filter((r) => r.kind === "uncertain_match");
  const shared = { emails: data.emails, matches: data.matches, invoices: data.invoices };

  return (
    <div className="flex flex-col gap-6" data-state="working">
      <Section id="payments-reconcile" title="Needs reconciliation" count={reconcile.length}>
        <UnmatchedList items={reconcile} label="Needs reconciliation" emptyText="No claimed payments to reconcile." {...shared} />
      </Section>
      <Section id="payments-unmatched" title="Unmatched emails" count={unmatched.length}>
        <UnmatchedList items={unmatched} label="Unmatched emails" emptyText="Every email is tied to one invoice." {...shared} />
      </Section>
      <Section id="payments-ledger" title="Ledger" count={data.payments.length}>
        <LedgerTable payments={data.payments} invoices={data.invoices} customers={data.customers} />
      </Section>
    </div>
  );
}

function Section({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <h2 id={id} className="flex items-baseline gap-2 text-sm font-semibold text-text">
        {title}
        <span className="text-xs font-normal text-text-muted">{count}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * No data yet. Loading or importing data lives in Settings (TASK-19), so
 * this state links there instead of running a loader itself.
 */
function NoData() {
  return (
    <EmptyState
      title="No payments yet"
      action={
        <Button asChild size="sm">
          <Link href="/settings#import">Load or import data</Link>
        </Button>
      }
    >
      Load the demo set or import your own CSV in Settings to see the ledger and the emails that need review.
    </EmptyState>
  );
}

function PaymentsError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Couldn’t load payments." onRetry={onRetry} />;
}

class PaymentsBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] payments failed to load", error);
  }
  render() {
    return this.state.failed ? <PaymentsError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
