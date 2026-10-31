"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { ageingBuckets, kpis, priorityMix, type HomeAggregateInput } from "@/domain/aggregates";
import { DbContext, useQueue, usePayments } from "@/store/hooks";
import { AgeingChart } from "./AgeingChart";
import { KpiStrip } from "./KpiStrip";
import { PriorityMixChart } from "./PriorityMixChart";
import { TaskFeed } from "./TaskFeed";

type BlockId = "kpi" | "feed" | "ageing" | "mix";

/**
 * Home (TASK-18.2/18.3, Design.md Home spec + §18): KPI strip, "Needs your
 * attention" task feed, two charts. Four page-level states, plus each
 * block independently error-boundaried so one bad aggregate doesn't blank
 * the rest of the page. Must render inside <Suspense> (it reads search
 * params).
 */
export function HomeView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state overrides (TP7): a normal build inlines `false`/`null` here.
  const isE2E = process.env.NEXT_PUBLIC_E2E === "1";
  const forced = isE2E ? params.get("__state") : null;
  const forcedBlockError = isE2E ? (params.get("__block_error") as BlockId | null) : null;

  let body: ReactNode;
  if (forced === "loading") body = <RowSkeleton label="Loading home" />;
  else if (forced === "empty") body = <NoAttention />;
  else if (forced === "error" || !db)
    body = <ErrorState message="Couldn’t load the home page." onRetry={() => window.location.reload()} />;
  else body = <HomeBody forcedBlockError={forcedBlockError} />;

  return (
    <section className="flex flex-col gap-6 p-7" aria-labelledby="home-title">
      <header className="flex flex-col gap-1">
        <h1
          id="home-title"
          className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text"
        >
          Home
        </h1>
        <p className="text-text-muted">What needs your attention today.</p>
      </header>
      {body}
    </section>
  );
}

function HomeBody({ forcedBlockError }: { forcedBlockError: BlockId | null }) {
  const items = useQueue();
  const payments = usePayments();

  if (items === undefined || payments === undefined) return <RowSkeleton label="Loading home" />;
  if (items.length === 0) return <NoAttention />;

  const input: HomeAggregateInput = { items, payments };

  return (
    <div className="flex flex-col gap-6" data-state="working">
      <Block id="kpi" forcedError={forcedBlockError === "kpi"} message="Couldn’t load the KPI strip.">
        <KpiStrip kpis={kpis(input)} />
      </Block>
      <Block id="feed" forcedError={forcedBlockError === "feed"} message="Couldn’t load the task feed.">
        <TaskFeed items={items} />
      </Block>
      <div className="grid gap-6 lg:grid-cols-2">
        <Block id="ageing" forcedError={forcedBlockError === "ageing"} message="Couldn’t load the ageing chart.">
          <AgeingChart buckets={ageingBuckets(input)} />
        </Block>
        <Block id="mix" forcedError={forcedBlockError === "mix"} message="Couldn’t load the priority mix chart.">
          <PriorityMixChart mix={priorityMix(input)} />
        </Block>
      </div>
    </div>
  );
}

/** Home's attention-centric empty copy (Design.md §18) — plain, no celebration. */
function NoAttention() {
  return <EmptyState title="Nothing needs your attention" />;
}

function ThrowIfForced({ forcedError }: { forcedError: boolean }): null {
  if (forcedError) throw new Error("forced block error (E2E, TC-056)");
  return null;
}

/** One independently-failing KPI/feed/chart block (TC-056). */
function Block({
  id,
  forcedError,
  message,
  children,
}: {
  id: BlockId;
  forcedError: boolean;
  message: string;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <div data-testid={`home-block-${id}`}>
      <BlockBoundary key={attempt} message={message} onRetry={() => setAttempt((n) => n + 1)}>
        <ThrowIfForced forcedError={forcedError} />
        {children}
      </BlockBoundary>
    </div>
  );
}

class BlockBoundary extends Component<
  { children: ReactNode; message: string; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] home block failed to load", error);
  }
  render() {
    return this.state.failed ? (
      <ErrorState message={this.props.message} onRetry={this.props.onRetry} />
    ) : (
      this.props.children
    );
  }
}
