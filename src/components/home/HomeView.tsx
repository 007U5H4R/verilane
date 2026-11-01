"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { ageingBuckets, kpis, priorityMix, type HomeAggregateInput } from "@/domain/aggregates";
import { DbContext, useDisputeCount, useQueue, usePayments } from "@/store/hooks";
import { HomeSkeleton } from "./HomeSkeleton";
import { KpiStrip } from "./KpiStrip";
import { TaskFeed } from "./TaskFeed";

// Charts load in their own chunk: recharts alone pushed Home's First Load JS
// past the 300 KB gzip budget (TASK-25 · TC-083). The fallback reserves the
// chart's height so nothing shifts when it arrives.
function ChartFallback({ height }: { height: string }) {
  return <div className={`${height} w-full animate-pulse rounded-md bg-surface-sunken`} aria-hidden="true" />;
}
const AgeingChart = dynamic(() => import("./AgeingChart").then((m) => m.AgeingChart), {
  loading: () => <ChartFallback height="h-64" />,
});
const PriorityMixChart = dynamic(() => import("./PriorityMixChart").then((m) => m.PriorityMixChart), {
  loading: () => <ChartFallback height="h-32" />,
});

type BlockId = "kpi" | "feed" | "ageing" | "mix";

/**
 * Home (TASK-18.2/18.3, Design.md Home spec + §18): KPI strip, "Needs your
 * attention" task feed, two charts. Four page-level states, plus each
 * block independently error-boundaried so one bad aggregate doesn't blank
 * the rest of the page: every aggregate is computed *inside* its block's
 * boundary (T18-1), never in `HomeBody`. Must render inside <Suspense> (it
 * reads search params).
 */
export function HomeView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state overrides (TP7): a normal build inlines `false`/`null` here.
  const isE2E = process.env.NEXT_PUBLIC_E2E === "1";
  const forced = isE2E ? params.get("__state") : null;
  const forcedBlockError = isE2E ? (params.get("__block_error") as BlockId | null) : null;

  let body: ReactNode;
  if (forced === "loading") body = <HomeSkeleton />;
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
  const openDisputes = useDisputeCount();

  if (items === undefined || payments === undefined || openDisputes === undefined) return <HomeSkeleton />;
  if (items.length === 0) return <NoAttention />;

  const input: HomeAggregateInput = { items, payments };
  // E2E (TC-056): a forced block gets input that throws when its aggregate
  // reads it, so the hook exercises the real aggregate-throws path.
  const inputFor = (id: BlockId) => (forcedBlockError === id ? poisoned(input) : input);

  return (
    <div className="flex flex-col gap-6" data-state="working">
      <Block
        id="kpi"
        input={inputFor("kpi")}
        message="Couldn’t load the KPI strip."
        render={(i) => <KpiStrip kpis={kpis(i)} openDisputesCount={openDisputes} />}
      />
      <Block
        id="feed"
        input={inputFor("feed")}
        message="Couldn’t load the task feed."
        render={(i) => <TaskFeed items={i.items} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Block
          id="ageing"
          input={inputFor("ageing")}
          message="Couldn’t load the ageing chart."
          render={(i) => <AgeingChart buckets={ageingBuckets(i)} />}
        />
        <Block
          id="mix"
          input={inputFor("mix")}
          message="Couldn’t load the priority mix chart."
          render={(i) => <PriorityMixChart mix={priorityMix(i)} />}
        />
      </div>
    </div>
  );
}

function poisoned(input: HomeAggregateInput): HomeAggregateInput {
  return {
    get items(): HomeAggregateInput["items"] {
      throw new Error("forced block error (E2E, TC-056)");
    },
    payments: input.payments,
  };
}

/** Home's attention-centric empty copy (Design.md §18) — plain, no celebration. */
function NoAttention() {
  return <EmptyState title="Nothing needs your attention" />;
}

type RenderBlock = (input: HomeAggregateInput) => ReactNode;

/** Runs the block's aggregate + render as a descendant of its boundary. */
function BlockContent({ input, render }: { input: HomeAggregateInput; render: RenderBlock }) {
  return render(input);
}

/** One independently-failing KPI/feed/chart block (TC-056). */
function Block({
  id,
  input,
  message,
  render,
}: {
  id: BlockId;
  input: HomeAggregateInput;
  message: string;
  render: RenderBlock;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <div data-testid={`home-block-${id}`}>
      <BlockBoundary key={attempt} message={message} onRetry={() => setAttempt((n) => n + 1)}>
        <BlockContent input={input} render={render} />
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
