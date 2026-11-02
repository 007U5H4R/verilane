"use client";

import { Component, useContext, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Button } from "@/components/ui/button";
import { DbContext, useRole } from "@/store/hooks";
import { useReconciliationData, type ReconciliationData } from "@/store/paymentsHooks";
import { buildModel } from "./model";
import { Illustration, KpiCards, Tabs, isTab, useUrlState, type TabId } from "./parts";
import { ReconciliationTab } from "./ReconciliationTab";

// Only one tab shows at a time; the other two load when chosen (route budget).
const UnmatchedTab = dynamic(() => import("./UnmatchedTab").then((m) => m.UnmatchedTab), { loading: () => <RowSkeleton /> });
const LedgerTab = dynamic(() => import("./LedgerTab").then((m) => m.LedgerTab), { loading: () => <RowSkeleton /> });

const PANEL_ID = "payments-panel";

/**
 * Payments & Reconciliation (TASK-13.4, redesigned in TASK-38): the ledger,
 * plus the emails that need a person — claimed payments to reconcile and
 * emails the strict matcher could not tie to one invoice. Nothing on this
 * page writes the ledger. Four states: loading, empty, error, working.
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
    <section className="flex flex-col gap-5 p-4 sm:p-7" aria-labelledby="payments-title">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="payments-title" className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]">
            Payments
          </h1>
          <p className="text-text-muted">The ledger, and the emails that need a person before anything changes.</p>
        </div>
        <Illustration className="hidden shrink-0 sm:block" />
      </header>
      {body}
    </section>
  );
}

function PaymentsBody() {
  const data = useReconciliationData();
  if (!data) return <RowSkeleton label="Loading payments" />;
  if (data.invoices.size === 0) return <NoData />;
  return <Working data={data} />;
}

function Working({ data }: { data: ReconciliationData }) {
  const role = useRole();
  const { params, set } = useUrlState();
  const model = useMemo(() => buildModel(data), [data]);
  const raw = params.get("tab");
  const tab: TabId = isTab(raw) ? raw : "reconcile";
  const select = (t: TabId) => set({ tab: t === "reconcile" ? null : t });
  const counts: Record<TabId, number> = {
    reconcile: model.kpis.needsReconciliation,
    unmatched: model.kpis.unmatchedEmails,
    ledger: model.kpis.ledgerEntries,
  };

  return (
    <div className="flex flex-col gap-5" data-state="working">
      <KpiCards kpis={model.kpis} onPick={select} />
      <Tabs active={tab} counts={counts} onSelect={select} panelId={PANEL_ID} />
      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`payments-tab-${tab}`} tabIndex={-1} className="outline-none">
        {tab === "reconcile" && <ReconciliationTab model={model} role={role} onViewLedger={() => select("ledger")} />}
        {tab === "unmatched" && <UnmatchedTab model={model} role={role} />}
        {tab === "ledger" && <LedgerTab model={model} />}
      </div>
    </div>
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
