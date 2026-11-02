"use client";

import { Component, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/states/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/domain/clock";
import {
  PAGE_SIZE,
  filterRows,
  isFiltering,
  kpis as registerKpis,
  pageInfo,
  parseParams,
  serializeParams,
  sortRows,
  type RegisterParams,
} from "@/domain/invoices/register";
import type { VerilaneDb } from "@/store/db";
import { DbContext, useAsOf } from "@/store/hooks";
import { useInvoiceCount, useInvoiceRegister } from "@/store/invoicesHooks";
import { InvoicesKpis } from "./InvoicesKpis";
import { InvoicesPagination } from "./InvoicesPagination";
import { InvoicesTable } from "./InvoicesTable";
import { InvoicesToolbar } from "./InvoicesToolbar";

/**
 * The Invoices register (TASK-38): every invoice on the ledger, closed ones
 * included — the Collections Queue is the ranked worklist, this is the full
 * record. Read-only: rows link to the invoice page, nothing is sent from
 * here. Filters, sort and page live in the URL. Four states: loading, empty
 * (no data / filtered), error, working. Must render inside <Suspense> (it
 * reads search params).
 */
export function InvoicesView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  let body;
  if (forced === "loading") body = <InvoicesSkeleton />;
  else if (forced === "empty") body = <NoInvoices db={db} />;
  else if (forced === "error" || !db) body = <InvoicesError onRetry={() => window.location.reload()} />;
  else
    body = (
      <InvoicesBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <InvoicesList />
      </InvoicesBoundary>
    );
  return (
    <section className="flex flex-col gap-5 p-4 md:p-7" aria-labelledby="invoices-title">
      <header className="flex flex-col gap-1">
        <h1 id="invoices-title" className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text md:text-[32px]">
          Invoices
        </h1>
        <Subtitle forced={forced} />
      </header>
      {body}
    </section>
  );
}

function Subtitle({ forced }: { forced: string | null }) {
  const count = useInvoiceCount();
  const asOf = useAsOf();
  const shown = forced === "empty" ? 0 : forced ? undefined : count;
  return (
    <p className="text-text-muted" data-testid="invoices-subtitle">
      {shown === undefined ? "Every invoice on the ledger, closed ones included" : `${shown} ${shown === 1 ? "invoice" : "invoices"} on the ledger, closed ones included`}
      {" · "}
      <span className="whitespace-nowrap">As of {formatDate(asOf)}</span>
    </p>
  );
}

/**
 * URL-backed params, mirrored in local state: `router.push` lands a beat
 * later, so reading the URL back between two quick changes would drop the
 * first (the Queue's TASK-9 lesson). A URL change we didn't make (back/
 * forward, a deep link) still wins.
 */
function useRegisterParams(): [RegisterParams, (next: RegisterParams, mode?: "push" | "replace") => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = serializeParams(parseParams(sp));
  const [params, setParams] = useState(() => parseParams(sp));
  const [seen, setSeen] = useState(fromUrl);
  if (fromUrl !== seen) {
    setSeen(fromUrl);
    setParams(parseParams(sp));
  }
  const update = (next: RegisterParams, mode: "push" | "replace" = "push") => {
    const qs = serializeParams(next);
    setParams(next);
    setSeen(qs);
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "replace") router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  };
  return [params, update];
}

function InvoicesList() {
  const data = useInvoiceRegister();
  const [params, setParams] = useRegisterParams();

  const filtered = useMemo(() => (data ? sortRows(filterRows(data.rows, params), params.sort) : []), [data, params]);
  const counts = useMemo(() => registerKpis(filtered), [filtered]);

  if (!data) return <InvoicesSkeleton />;
  if (data.rows.length === 0) return <NoInvoices db={null} live />;

  const filtering = isFiltering(params);
  const info = pageInfo(filtered.length, params.page, PAGE_SIZE);
  const rows = filtered.slice(info.start === 0 ? 0 : info.start - 1, info.end);
  const set = (patch: Partial<RegisterParams>, mode?: "push" | "replace") => setParams({ ...params, page: 1, ...patch }, mode);
  const clear = () => set({ q: "", status: null, ageing: null, customer: null });

  return (
    <div className="flex flex-col gap-4" data-state="working">
      <InvoicesKpis kpis={counts} />
      <p className="-mt-2 text-[11px] text-text-muted" data-testid="invoices-kpi-scope">
        {filtering
          ? `Figures cover the ${filtered.length} ${filtered.length === 1 ? "invoice" : "invoices"} matching the filters below.`
          : `Figures cover all ${data.rows.length} invoices. Outstanding counts only invoices that are not closed.`}
      </p>

      <InvoicesToolbar
        params={params}
        customers={data.customers}
        onChange={set}
        onClear={clear}
        filtering={filtering}
        shown={filtered.length}
        total={data.rows.length}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-6 shadow-card" data-state="empty-filtered">
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold text-text">No invoices match these filters</p>
            <p className="text-[13px] text-text-muted">Try a different search or fewer filters.</p>
          </div>
          <Button variant="outline" className="ml-auto max-md:min-h-11" onClick={clear}>
            Reset filters
          </Button>
        </div>
      ) : (
        <>
          <InvoicesTable rows={rows} sort={params.sort} onSort={(sort) => set({ sort })} />
          <InvoicesPagination info={info} onPage={(page) => setParams({ ...params, page })} />
        </>
      )}
    </div>
  );
}

/**
 * No invoices at all. `live` = the real store is empty (offer to load the
 * demo set through the audited reset command); otherwise it's the forced
 * E2E state, which uses the db from context when there is one.
 */
function NoInvoices({ db, live }: { db: VerilaneDb | null; live?: boolean }) {
  const ctx = useContext(DbContext);
  const target = live ? ctx : db;
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!target || busy) return;
    setBusy(true);
    try {
      // R5: through the audited reset_demo command, never a raw load.
      // Loaded on use, so the reset path stays out of the first load (TASK-40).
      const { resetDemo } = await import("@/store/dataCommands");
      await resetDemo(target);
    } catch {
      toast.error("Couldn’t load the demo data. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <EmptyState
      title="No invoices yet"
      state="empty"
      action={
        <Button onClick={load} disabled={!target || busy} className="max-md:min-h-11">
          Load demo data
        </Button>
      }
    >
      Load the demo set or import your own ledger CSV. Imported data stays in this browser.
    </EmptyState>
  );
}

export function InvoicesSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-state="loading" aria-busy="true" aria-label="Loading invoices">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[92px] animate-pulse rounded-lg bg-surface-sunken" />
        ))}
      </div>
      <span className="h-[120px] animate-pulse rounded-lg bg-surface-sunken md:h-[76px]" />
      <div className="rounded-lg border border-border bg-surface px-4 shadow-card">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border py-3.5 last:border-b-0">
            <span className="h-3.5 w-20 animate-pulse rounded bg-surface-sunken" />
            <span className="h-3.5 w-1/4 animate-pulse rounded bg-surface-sunken" />
            <span className="ml-auto h-3.5 w-24 animate-pulse rounded bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoicesError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card" data-state="error">
      <p className="text-text">Couldn’t load the invoices.</p>
      <Button variant="outline" onClick={onRetry} className="max-md:min-h-11">
        Retry
      </Button>
    </div>
  );
}

class InvoicesBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] invoices failed to load", error);
  }
  render() {
    return this.state.failed ? <InvoicesError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
