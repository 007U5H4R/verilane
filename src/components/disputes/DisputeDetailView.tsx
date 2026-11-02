"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Button } from "@/components/ui/button";
import { DbContext } from "@/store/hooks";
import { AssignMenu } from "./AssignMenu";
import { DisputeInvestigation } from "./DisputeInvestigation";
import { ResolveDialog } from "./ResolveDialog";
import { useAssignDispute } from "./useAssignDispute";
import { useDisputeCases } from "./useDisputeCases";

export function DisputeDetailSkeleton() {
  return (
    <div className="p-7">
      <RowSkeleton label="Loading dispute" rows={3} />
    </div>
  );
}

/**
 * Dispute detail (TASK-17.3, redesigned in TASK-38): the full investigation
 * for one dispute, with assign and resolve. No `generateStaticParams` (dispute
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
    <div className="p-4 sm:p-7">
      <DisputeBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <DisputeBody id={id} />
      </DisputeBoundary>
    </div>
  );
}

function DisputeBody({ id }: { id: string }) {
  const cases = useDisputeCases();
  const assign = useAssignDispute();
  const [resolving, setResolving] = useState(false);
  if (cases === undefined) return <DisputeDetailSkeleton />;
  const item = cases.find((c) => c.dispute.dispute_id === id);
  if (!item) {
    return (
      <div data-state="not-found" className="flex flex-col gap-2">
        <p className="text-text">Dispute not found.</p>
        <Link href="/disputes" className="text-sm text-brand-strong underline">
          ← Back to disputes
        </Link>
      </div>
    );
  }

  const { dispute } = item;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4" data-state="working">
      <Link href="/disputes" className="w-fit text-sm text-brand-strong underline">
        ← Back to disputes
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
            {item.customerName}
          </h1>
          <p className="font-mono text-[13px] text-text-muted">
            {dispute.dispute_id} · {item.invoiceLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssignMenu
            current={dispute.assigned_reviewer ?? null}
            disabled={!item.open}
            disabledReason="This dispute is closed."
            onAssign={(r) => void assign(dispute.dispute_id, r)}
            label={`Assign owner for ${dispute.dispute_id}`}
          />
          <Button
            type="button"
            size="sm"
            disabled={!item.open}
            title={item.open ? undefined : "This dispute is closed."}
            onClick={() => setResolving(true)}
          >
            Resolve
          </Button>
        </div>
      </div>
      <DisputeInvestigation item={item} primary />
      {resolving && <ResolveDialog item={item} open onOpenChange={(o) => setResolving(o)} />}
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
