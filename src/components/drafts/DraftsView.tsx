"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { autopilotEligibility, type AutopilotPolicy } from "@/domain/autopilot";
import { formatInr, paise } from "@/domain/money";
import { CHECK_NAMES } from "@/domain/validate";
import {
  DbContext,
  useAutopilotPolicy,
  useBlockedDrafts,
  useDraftsAwaitingApproval,
  type DraftAwaitingApproval,
} from "@/store/hooks";

/**
 * Drafts (TASK-16.5, Design.md §18 "Review & Approvals"): every draft
 * awaiting approval (status `validated`), linking into the Investigation
 * view where Approve & send actually happens. Four states: loading, empty,
 * error, working. Must render inside <Suspense> (it reads search params).
 */
export function DraftsView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  let body;
  if (forced === "loading") body = <RowSkeleton label="Loading drafts" />;
  else if (forced === "empty") body = <NoDrafts />;
  else if (forced === "error" || !db) body = <DraftsError onRetry={() => window.location.reload()} />;
  else
    body = (
      <DraftsBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <DraftsBody />
      </DraftsBoundary>
    );

  return (
    <section className="flex flex-col gap-4 p-7" aria-labelledby="drafts-title">
      <header className="flex flex-col gap-1">
        <h1 id="drafts-title" className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
          Drafts
        </h1>
        <p className="text-text-muted">Reminder drafts awaiting approval. Approve &amp; send happens in Investigation.</p>
      </header>
      {body}
    </section>
  );
}

function DraftsBody() {
  const drafts = useDraftsAwaitingApproval();
  const blocked = useBlockedDrafts();
  const policy = useAutopilotPolicy();
  if (!drafts || !blocked) return <RowSkeleton label="Loading drafts" />;
  if (drafts.length === 0 && blocked.length === 0) return <NoDrafts />;

  return (
    <>
      {drafts.length === 0 ? (
        <NoDrafts />
      ) : (
        <ul className="flex flex-col" data-state="working" data-testid="draft-list">
          {drafts.map((d) => (
            <DraftRow key={d.draft.draft_id} {...d} policy={policy?.enabled ? policy : undefined} />
          ))}
        </ul>
      )}
      {blocked.length > 0 && <BlockedDrafts drafts={blocked} />}
    </>
  );
}

/**
 * T16-4: a validated draft whose last validation left failed checks (e.g.
 * approve_draft's live re-check) is not awaiting approval — it is shown
 * apart, with the checks that failed, so it is never mistaken for one.
 */
function BlockedDrafts({ drafts }: { drafts: DraftAwaitingApproval[] }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="blocked-drafts-title" data-testid="blocked-drafts">
      <h2 id="blocked-drafts-title" className="font-display text-lg font-semibold text-text">
        Blocked — checks failed
      </h2>
      <p className="text-sm text-text-muted">These drafts can’t be approved until the failed checks pass. Open one to fix it.</p>
      <ul className="flex flex-col">
        {drafts.map((d) => (
          <DraftRow key={d.draft.draft_id} {...d} blocked />
        ))}
      </ul>
    </section>
  );
}

function DraftRow({
  draft,
  customer,
  invoice,
  blocked = false,
  policy,
}: DraftAwaitingApproval & { blocked?: boolean; policy?: AutopilotPolicy }) {
  // TASK-41: with autopilot on, say up front which drafts Copilot will send.
  const auto = policy ? autopilotEligibility(draft, policy) : null;
  return (
    <li className="border-b border-border py-3" data-testid={blocked ? "blocked-draft-row" : "draft-row"}>
      <Link
        href={`/invoices/${encodeURIComponent(draft.invoice_id)}`}
        className="flex flex-col gap-1 rounded-md px-2 py-1 hover:bg-surface-sunken"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text">{customer?.name ?? draft.customer_id}</span>
          {invoice?.invoice_number && (
            <span className="font-mono text-xs text-text-muted">{invoice.invoice_number}</span>
          )}
          <span className="text-xs tabular-nums text-text-muted">{formatInr(paise(draft.amount_paise))}</span>
          {auto &&
            (auto.eligible ? (
              <Badge variant="default" data-testid="autopilot-badge">
                Copilot will send
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="autopilot-badge">
                Needs you: {auto.reason}
              </Badge>
            ))}
        </div>
        {blocked && (
          <ul className="flex flex-wrap gap-1" aria-label="Failed checks">
            {(draft.failed_checks ?? []).map((id) => (
              <li key={id}>
                <Badge variant="high">{CHECK_NAMES[id] ?? `Check ${id}`}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </li>
  );
}

/** No draft has been submitted for approval yet; drafts start from the queue. */
function NoDrafts() {
  return (
    <EmptyState
      title="Nothing waiting for approval"
      action={
        <Button asChild size="sm">
          <Link href="/queue">Go to queue</Link>
        </Button>
      }
    >
      Generate a reminder from an invoice in the queue and submit it for approval to see it here.
    </EmptyState>
  );
}

function DraftsError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Couldn’t load drafts." onRetry={onRetry} />;
}

class DraftsBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] drafts failed to load", error);
  }
  render() {
    return this.state.failed ? <DraftsError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
