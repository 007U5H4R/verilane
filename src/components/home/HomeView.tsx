"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { ageingBuckets, kpis, priorityMix, type HomeAggregateInput } from "@/domain/aggregates";
import { formatDate } from "@/domain/clock";
import { computeNsm, type NsmInput } from "@/domain/nsm";
import { attentionGroups, type DraftLike } from "@/domain/home/attention";
import {
  DbContext,
  useAsOf,
  useCustomers,
  useDisputeCount,
  useDraftsAwaitingApproval,
  useQueue,
  usePayments,
} from "@/store/hooks";
import { useOnline } from "@/lib/useOnline";
import { HomeSkeleton } from "./HomeSkeleton";
import { KpiStrip } from "./KpiStrip";
import { NsmSection } from "./NsmSection";
import { TaskFeed } from "./TaskFeed";
import { useOpenPaymentExceptions, useOpenPaymentReviews } from "./useHomeAttention";
import { useNsmInput } from "./useNsm";

// Charts load in their own chunk: recharts alone pushed Home's First Load JS
// past the 300 KB gzip budget (TASK-25 · TC-083). The fallback reserves the
// chart's height so nothing shifts when it arrives.
function ChartFallback({ height }: { height: string }) {
  return (
    <div className={`${height} w-full animate-pulse rounded-2xl border border-border bg-surface shadow-card`} aria-hidden="true" />
  );
}
const AgeingChart = dynamic(() => import("./AgeingChart").then((m) => m.AgeingChart), {
  loading: () => <ChartFallback height="h-[400px]" />,
});
const PriorityMixChart = dynamic(() => import("./PriorityMixChart").then((m) => m.PriorityMixChart), {
  loading: () => <ChartFallback height="h-[240px]" />,
});

type BlockId = "kpi" | "nsm" | "feed" | "ageing" | "mix";

/**
 * Home (TASK-18.2/18.3, Design.md Home spec + §18): KPI strip, the North
 * Star Metric section (TKT-75.07, Design-TASK-75 §6), "Needs your
 * attention" task feed, two charts. Four page-level states, plus each
 * block independently error-boundaried so one bad aggregate doesn't blank
 * the rest of the page: every aggregate is computed *inside* its block's
 * boundary (T18-1), never in `HomeBody`. Must render inside <Suspense> (it
 * reads search params).
 */
export function HomeView() {
  const db = useContext(DbContext);
  const asOf = useAsOf();
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
    <section className="flex min-w-0 flex-col gap-6 p-4 sm:p-7" aria-labelledby="home-title">
      <header className="flex flex-col gap-1">
        <h1
          id="home-title"
          className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]"
        >
          Home
        </h1>
        <p className="text-text-muted" data-testid="home-as-of">
          As of {formatDate(asOf)} · What needs your attention today.
        </p>
      </header>
      {body}
    </section>
  );
}

function HomeBody({ forcedBlockError }: { forcedBlockError: BlockId | null }) {
  const items = useQueue();
  const payments = usePayments();
  const openDisputes = useDisputeCount();
  const customers = useCustomers();
  const drafts = useDraftsAwaitingApproval();
  const reviews = useOpenPaymentReviews();
  const exceptions = useOpenPaymentExceptions();

  if (
    items === undefined ||
    payments === undefined ||
    openDisputes === undefined ||
    customers === undefined ||
    drafts === undefined ||
    reviews === undefined ||
    exceptions === undefined
  )
    return <HomeSkeleton />;
  if (items.length === 0) return <NoAttention />;

  const input: HomeAggregateInput = { items, payments };
  const customerNames = new Map([...customers].map(([id, c]) => [id, c.name]));
  const draftRows: DraftLike[] = drafts.map((d) => d.draft);
  // E2E (TC-056): a forced block gets input that throws when its aggregate
  // reads it, so the hook exercises the real aggregate-throws path.
  const inputFor = (id: BlockId) => (forcedBlockError === id ? poisoned(input) : input);

  return (
    <div className="flex min-w-0 flex-col gap-6" data-state="working">
      <Block
        id="kpi"
        input={inputFor("kpi")}
        message="Couldn’t load the KPI strip."
        render={(i) => <KpiStrip kpis={kpis(i)} openDisputesCount={openDisputes} />}
      />
      <NsmBlock forceError={forcedBlockError === "nsm"} />
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Block
          id="feed"
          input={inputFor("feed")}
          message="Couldn’t load the task feed."
          render={(i) => (
            <TaskFeed
              groups={attentionGroups({
                items: i.items,
                payments: i.payments,
                customerNames,
                drafts: draftRows,
                reviews,
                exceptions,
              })}
            />
          )}
        />
        <div className="flex min-w-0 flex-col gap-6">
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

/**
 * The NSM section in its own boundary (TC-75.44): it loads and fails
 * independently of the KPI/feed/chart blocks, and `computeNsm` runs during
 * render so a throw lands in the boundary, not in the live query.
 */
function NsmBlock({ forceError }: { forceError: boolean }) {
  const nsmInput = useNsmInput();
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);
  return (
    <div data-testid="home-block-nsm" className="min-w-0">
      <BlockBoundary
        key={attempt}
        message="Couldn’t compute the North Star Metric."
        onRetry={retry}
        fallback={<NsmSection result={undefined} online={online} error onRetry={retry} />}
      >
        <NsmContent input={nsmInput} online={online} forceError={forceError} />
      </BlockBoundary>
    </div>
  );
}

function NsmContent({ input, online, forceError }: { input: NsmInput | undefined; online: boolean; forceError: boolean }) {
  // E2E (TC-056 pattern): a forced error throws where the real computation would.
  if (forceError) throw new Error("forced block error (E2E, TC-056)");
  return <NsmSection result={input ? computeNsm(input) : undefined} online={online} />;
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
    <div data-testid={`home-block-${id}`} className="min-w-0">
      <BlockBoundary key={attempt} message={message} onRetry={() => setAttempt((n) => n + 1)}>
        <BlockContent input={input} render={render} />
      </BlockBoundary>
    </div>
  );
}

class BlockBoundary extends Component<
  { children: ReactNode; message: string; onRetry: () => void; fallback?: ReactNode },
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
      (this.props.fallback ?? <ErrorState message={this.props.message} onRetry={this.props.onRetry} />)
    ) : (
      this.props.children
    );
  }
}
