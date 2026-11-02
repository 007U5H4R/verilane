"use client";

import { Component, useContext, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, MessagesSquare, Scale, Search, X, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/domain/clock";
import {
  DEFAULT_FILTERS,
  INTENT_FILTERS,
  LINKED_FILTERS,
  activeFilterCount,
  filterThreads,
  kpisFor,
  paginate,
  parseFilters,
  serializeFilters,
  sortThreads,
  type EmailFilters,
  type EmailSort,
  type IntentFilter,
  type LinkedFilter,
} from "@/domain/emails/listing";
import type { EmailThread } from "@/domain/emails/threads";
import { MatchOutcomeSchema, type MatchOutcome } from "@/domain/schema";
import { cn } from "@/lib/cn";
import { useEmailThreads, type EmailThreadsData } from "@/store/emailsHooks";
import { DbContext, useAsOf } from "@/store/hooks";
import { CLASS_LABEL, CLASS_VARIANT, INTENT_LABEL, LINKED_LABEL, OUTCOME_LABEL } from "./labels";
import { useIsDesktop } from "./useIsDesktop";

// The conversation pane and the mobile sheet load in their own chunks: both
// render only once a conversation is selected (route budget, TASK-38).
function PaneLoadingFallback() {
  return <div className="h-40 w-full animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />;
}
const ThreadDetail = dynamic(() => import("./ThreadDetail").then((m) => m.ThreadDetail), {
  loading: PaneLoadingFallback,
});
const ThreadSheet = dynamic(() => import("./ThreadSheet").then((m) => m.ThreadSheet));

const NA = "Not available.";
const FIELD =
  "h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 lg:h-9";
const LINK = "rounded text-brand-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const OUTCOMES = MatchOutcomeSchema.options;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hrefFor = (f: EmailFilters) => {
  const qs = serializeFilters(f);
  return qs ? `/emails?${qs}` : "/emails";
};

/**
 * Email Conversations (TASK-38): the ingested customer emails grouped into
 * threads, with real counts, URL-backed filters, a paginated list and a
 * read-only conversation pane (two-pane at ≥1024 px, a sheet below). Four
 * states: loading, empty, error, working. Must render inside <Suspense>
 * (it reads search params). Nothing here sends or replies to anything.
 */
export function EmailsView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  let body;
  if (forced === "loading") body = <WithHeader><EmailsLoading /></WithHeader>;
  else if (forced === "empty") body = <WithHeader><NoEmails /></WithHeader>;
  else if (forced === "error" || !db)
    body = <WithHeader><EmailsError onRetry={() => window.location.reload()} /></WithHeader>;
  else
    body = (
      <EmailsBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <EmailsBody />
      </EmailsBoundary>
    );

  return (
    <section className="flex min-w-0 flex-col gap-5 p-4 sm:p-7" aria-labelledby="emails-title">
      {body}
    </section>
  );
}

function PageHeader({ subtitle }: { subtitle?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-col gap-1">
      <h1 id="emails-title" className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]">
        Email Conversations
      </h1>
      <p className="text-text-muted" data-testid="emails-subtitle">
        {subtitle ?? "Customer emails, grouped by conversation, with what the pipeline read in each."}
      </p>
    </header>
  );
}

function WithHeader({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader />
      {children}
    </>
  );
}

function EmailsLoading() {
  return <RowSkeleton label="Loading email conversations" />;
}

function EmailsBody() {
  const data = useEmailThreads();
  if (!data) return <WithHeader><EmailsLoading /></WithHeader>;
  if (data.threads.length === 0) return <WithHeader><NoEmails /></WithHeader>;
  return <Working data={data} />;
}

function Working({ data }: { data: EmailThreadsData }) {
  const router = useRouter();
  const params = useSearchParams();
  const asOf = useAsOf();
  const isDesktop = useIsDesktop();
  const filters = parseFilters(new URLSearchParams(params.toString()));
  const { threads, invoices, customers } = data;

  // The search box keeps its own text so typing never waits on navigation;
  // a URL change from elsewhere (back, a KPI card, Clear) resets it.
  const [q, setQ] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    setQ(filters.q);
  }

  const visible = useMemo(() => sortThreads(filterThreads(threads, filters), filters.sort), [threads, filters]);
  const kpis = kpisFor(threads);
  const page = paginate(visible, filters.page);
  const selected = filters.thread ? threads.find((t) => t.thread_id === filters.thread) : undefined;
  const active = activeFilterCount(filters);

  const navigate = (patch: Partial<EmailFilters>, resetPage = true) => {
    router.replace(hrefFor({ ...filters, ...patch, ...(resetPage && !("page" in patch) ? { page: 1 } : {}) }), { scroll: false });
  };
  const toggleFacet = (patch: Partial<EmailFilters>, on: boolean) =>
    navigate(on ? Object.fromEntries(Object.keys(patch).map((k) => [k, null])) : patch);
  const clearFilters = () => navigate({ ...DEFAULT_FILTERS, sort: filters.sort, thread: filters.thread });
  const closeThread = () => navigate({ thread: null }, false);

  const subtitle = (
    <>
      {plural(kpis.threads, "conversation")} · {plural(kpis.messages, "message")} from {plural(kpis.customers, "customer")}, as of{" "}
      <time dateTime={asOf}>{formatDate(asOf)}</time>.
    </>
  );

  return (
    <>
      <PageHeader subtitle={subtitle} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="emails-kpis">
        <KpiCard
          icon={MessagesSquare}
          tone="brand"
          label="Conversations"
          value={kpis.threads}
          caption={plural(kpis.messages, "message")}
          pressed={active === 0}
          onClick={clearFilters}
        />
        <KpiCard
          icon={Inbox}
          tone="med"
          label="Need review"
          value={kpis.needsReview}
          caption="with an open review item"
          pressed={filters.linked === "review"}
          onClick={() => toggleFacet({ linked: "review" }, filters.linked === "review")}
        />
        <KpiCard
          icon={Scale}
          tone="high"
          label="Raised a dispute"
          value={kpis.linkedToDispute}
          caption="linked to a dispute"
          pressed={filters.linked === "dispute"}
          onClick={() => toggleFacet({ linked: "dispute" }, filters.linked === "dispute")}
        />
        <KpiCard
          icon={AlertTriangle}
          tone="low"
          label="Rejected extractions"
          value={kpis.rejected}
          caption="messages the validator rejected"
          pressed={filters.intent === "rejected"}
          onClick={() => toggleFacet({ intent: "rejected" }, filters.intent === "rejected")}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4" role="search" aria-label="Filter conversations">
        <label className="relative block" htmlFor="emails-q">
          <span className="sr-only">Search customer, subject or invoice number</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            id="emails-q"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSyncedQ(e.target.value);
              navigate({ q: e.target.value });
            }}
            placeholder="Search customer, subject or invoice number"
            className={cn(FIELD, "w-full pl-9")}
            autoComplete="off"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Select id="emails-customer" label="Customer" value={filters.customer ?? ""} onChange={(v) => navigate({ customer: v || null })}>
            <option value="">Customer: All</option>
            {customers.map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select id="emails-intent" label="Intent" value={filters.intent ?? ""} onChange={(v) => navigate({ intent: (v || null) as IntentFilter | null })}>
            <option value="">Intent: All</option>
            {INTENT_FILTERS.map((i) => (
              <option key={i} value={i}>
                {INTENT_LABEL[i]}
              </option>
            ))}
          </Select>
          <Select id="emails-outcome" label="Match outcome" value={filters.outcome ?? ""} onChange={(v) => navigate({ outcome: (v || null) as MatchOutcome | null })}>
            <option value="">Match outcome: All</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </Select>
          <Select id="emails-linked" label="Linked status" value={filters.linked ?? ""} onChange={(v) => navigate({ linked: (v || null) as LinkedFilter | null })}>
            <option value="">Linked: All</option>
            {LINKED_FILTERS.map((l) => (
              <option key={l} value={l}>
                {LINKED_LABEL[l]}
              </option>
            ))}
          </Select>
          <Select id="emails-sort" label="Sort" value={filters.sort} onChange={(v) => navigate({ sort: v as EmailSort })}>
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-muted tabular-nums" aria-live="polite" data-testid="emails-count">
            {visible.length === threads.length
              ? `Showing all ${plural(threads.length, "conversation")}`
              : `${visible.length} of ${plural(threads.length, "conversation")} match`}
          </p>
          {active > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-11 lg:h-8">
              <X aria-hidden className="size-3.5" />
              Clear filters ({active})
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          {visible.length === 0 ? (
            <EmptyState
              title="No conversations match"
              state="filtered"
              action={
                <Button type="button" variant="outline" size="sm" onClick={clearFilters} className="h-11 lg:h-8">
                  Clear filters
                </Button>
              }
            >
              Try a different search or clear the filters.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2" data-state="working" data-testid="email-thread-list" aria-label="Conversations">
              {page.items.map((t) => (
                <ThreadRow key={t.thread_id} thread={t} href={hrefFor({ ...filters, thread: t.thread_id })} selected={t.thread_id === filters.thread} />
              ))}
            </ul>
          )}

          {visible.length > 0 && page.pageCount > 1 && (
            <nav aria-label="Conversation pages" className="flex flex-col items-center justify-between gap-2 border-t border-border pt-3 sm:flex-row">
              <p className="text-sm text-text-muted tabular-nums">
                Showing {page.from}–{page.to} of {page.total}
              </p>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-11 lg:h-8" disabled={page.page <= 1} onClick={() => navigate({ page: page.page - 1 })}>
                  <ChevronLeft aria-hidden className="size-3.5" />
                  Prev
                </Button>
                {Array.from({ length: page.pageCount }, (_, i) => i + 1).map((n) =>
                  n === page.page ? (
                    <span
                      key={n}
                      aria-current="page"
                      className="grid size-11 place-items-center rounded-lg bg-brand text-sm font-semibold text-brand-foreground tabular-nums lg:size-8"
                    >
                      <span className="sr-only">Page </span>
                      {n}
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => navigate({ page: n })}
                      aria-label={`Page ${n}`}
                      className="grid size-11 place-items-center rounded-lg text-sm text-text tabular-nums hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:size-8"
                    >
                      {n}
                    </button>
                  ),
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 lg:h-8"
                  disabled={page.page >= page.pageCount}
                  onClick={() => navigate({ page: page.page + 1 })}
                >
                  Next
                  <ChevronRight aria-hidden className="size-3.5" />
                </Button>
              </div>
            </nav>
          )}
        </div>

        {isDesktop === true && (
          <aside
            aria-label="Conversation"
            className="sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
            data-testid="email-pane"
          >
            {filters.thread ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-lg font-semibold text-text">{selected ? selected.subject : "Conversation not found"}</h2>
                    <p className="font-mono text-[13px] text-text-muted">{filters.thread}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={closeThread} aria-label="Close conversation" className="size-8">
                    <X aria-hidden className="size-4" />
                  </Button>
                </div>
                <div className="min-h-0 overflow-y-auto p-4">
                  {selected ? (
                    <ThreadDetail thread={selected} invoices={invoices} />
                  ) : (
                    <p className="text-sm text-text-muted" role="status">
                      No conversation with this id is in the loaded data.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <MessagesSquare aria-hidden className="size-8 text-text-muted" />
                <p className="text-sm font-medium text-text">Select a conversation</p>
                <p className="text-sm text-text-muted">Its messages and what the pipeline read in them appear here.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {isDesktop === false && filters.thread && (
        <ThreadSheet thread={selected} threadId={filters.thread} invoices={invoices} onClose={closeThread} />
      )}
    </>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(FIELD, "w-full min-w-0")}>
        {children}
      </select>
    </label>
  );
}

function ThreadRow({ thread: t, href, selected }: { thread: EmailThread; href: string; selected: boolean }) {
  const snippet = t.latest.email.body.replace(/\s+/g, " ").trim();
  return (
    <li
      data-testid="email-thread-row"
      data-thread-id={t.thread_id}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-surface p-3 transition-colors motion-reduce:transition-none",
        selected ? "border-brand bg-brand-tint" : "border-border hover:bg-surface-sunken",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={cn("min-w-0 truncate text-sm font-semibold", t.customerName ? "text-text" : "font-normal text-text-muted")}>
          {t.customerName ?? NA}
        </span>
        <time dateTime={t.lastSentAt} className="shrink-0 text-xs text-text-muted tabular-nums">
          {formatDateTime(t.lastSentAt)}
        </time>
      </div>
      <Link
        href={href}
        scroll={false}
        aria-current={selected ? "true" : undefined}
        className={cn(LINK, "-my-1 flex min-h-11 items-center text-[15px] font-medium text-text lg:min-h-0 lg:py-1")}
      >
        <span className="line-clamp-2">{t.subject}</span>
      </Link>
      {snippet && <p className="line-clamp-2 text-[13px] text-text-muted">{snippet}</p>}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-xs text-text-muted tabular-nums">{plural(t.messages.length, "message")}</span>
        {t.intents.map((i) => (
          <Badge key={i} variant={CLASS_VARIANT[i]}>
            {CLASS_LABEL[i]}
          </Badge>
        ))}
        {t.rejected > 0 && <Badge variant="high">Rejected extraction</Badge>}
        {t.invoices.map((i) => (
          <Link
            key={i.invoice_id}
            href={`/invoices/${encodeURIComponent(i.invoice_id)}`}
            className={cn(LINK, "inline-flex min-h-11 items-center px-1 font-mono text-xs lg:min-h-0")}
            aria-label={`Invoice ${i.label}`}
          >
            {i.label}
          </Link>
        ))}
      </div>
    </li>
  );
}

const KPI_TONE = {
  brand: { icon: "bg-brand-tint text-brand-strong", dot: "bg-brand", pill: "bg-brand-tint text-brand-strong" },
  high: { icon: "bg-high-bg text-high", dot: "bg-high", pill: "bg-high-bg text-high" },
  med: { icon: "bg-med-bg text-med", dot: "bg-med", pill: "bg-med-bg text-med" },
  low: { icon: "bg-low-bg text-low", dot: "bg-low", pill: "bg-low-bg text-low" },
} as const;

/** A summary card that doubles as a filter (aria-pressed). Counts come from `kpisFor`. */
function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  caption,
  pressed,
  onClick,
}: {
  icon: LucideIcon;
  tone: keyof typeof KPI_TONE;
  label: string;
  value: number;
  caption: string;
  pressed: boolean;
  onClick: () => void;
}) {
  const t = KPI_TONE[tone];
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid="emails-kpi"
      className={cn(
        "flex items-start gap-4 rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-sunken motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        pressed && "ring-2 ring-brand",
      )}
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", t.icon)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        <span className="font-display text-[28px] font-semibold leading-none text-text tabular-nums">{value}</span>
        <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", t.pill)}>
          <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />
          {caption}
        </span>
      </span>
    </button>
  );
}

/**
 * No emails yet. Loading or importing data lives in Settings (TASK-19), so
 * this state links there instead of running a loader itself.
 */
function NoEmails() {
  return (
    <EmptyState
      title="No email conversations yet"
      action={
        <Button asChild size="sm">
          <Link href="/settings#import">Load or import data</Link>
        </Button>
      }
    >
      Load the demo set or import your own emails in Settings to see customer conversations here.
    </EmptyState>
  );
}

function EmailsError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState message="Couldn’t load email conversations." onRetry={onRetry} />;
}

class EmailsBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] email conversations failed to load", error);
  }
  render() {
    return this.state.failed ? (
      <WithHeader>
        <EmailsError onRetry={this.props.onRetry} />
      </WithHeader>
    ) : (
      this.props.children
    );
  }
}
