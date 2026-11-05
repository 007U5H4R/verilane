"use client";

import { Component, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { applyUpdate, initIntent, onUrl } from "@/components/queue/filterIntent";
import { FiltersPanel, type ApplyFilters } from "@/components/queue/FiltersPanel";
import { DEFAULT_FILTERS, parse } from "@/components/queue/queueParams";
import { filterExceptionRows } from "@/domain/exceptions/list";
import { InvoiceStatusSchema, PriorityBandSchema } from "@/domain/schema";
import { DbContext, useCustomers, useOpenExceptionRows } from "@/store/hooks";
import { ExceptionCards, ExceptionsEmpty, ExceptionsError, ExceptionsLoading } from "./ExceptionCards";

/**
 * `/exceptions` (TKT-75.02): every open exception, all seven kinds, as row
 * cards with the v1 Queue filters (search, priority, status, customer,
 * ageing) held in the URL. Four screen states (Design-TASK-75 §13); offline
 * needs nothing extra — the list reads local IndexedDB and the shell shows
 * the offline banner. Must render inside <Suspense> (it reads search params).
 */
export function ExceptionsView() {
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  if (forced === "loading") return <Frame><ExceptionsLoading /></Frame>;
  if (forced === "empty") return <Frame><ExceptionsEmpty filtered={false} /></Frame>;
  if (forced === "error" || !db) return <Frame><ExceptionsError onRetry={() => window.location.reload()} /></Frame>;
  return (
    <Frame>
      <ListBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <ExceptionsBody params={params.toString()} />
      </ListBoundary>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-5 p-4 md:p-7" aria-labelledby="exceptions-title">
      <header className="flex min-w-0 flex-col gap-1">
        <h1
          id="exceptions-title"
          className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text md:text-[32px]"
        >
          Exceptions
        </h1>
        <p className="text-sm text-text-muted">Items that need a person: email reviews and unapplied bank lines.</p>
      </header>
      {children}
    </section>
  );
}

function ExceptionsBody({ params }: { params: string }) {
  const router = useRouter();
  const rows = useOpenExceptionRows();
  const customers = useCustomers();
  const filters = useMemo(() => parse(new URLSearchParams(params)), [params]);

  // Same URL intent handling as the Queue: the URL lags router.push.
  const intent = useRef(initIntent(filters));
  useEffect(() => {
    intent.current = onUrl(intent.current, filters);
  }, [filters]);

  const apply = useCallback<ApplyFilters>(
    (update, mode) => {
      const { state, qs } = applyUpdate(intent.current, update);
      intent.current = state;
      const url = qs ? `/exceptions?${qs}` : "/exceptions";
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router],
  );

  const facets = useMemo(() => {
    const all = rows ?? [];
    const bands = new Set([...all.flatMap((r) => (r.band ? [r.band] : [])), ...filters.band]);
    const statuses = new Set([...all.flatMap((r) => (r.invoiceStatus ? [r.invoiceStatus] : [])), ...filters.status]);
    const ids = new Set([...all.flatMap((r) => (r.customerId ? [r.customerId] : [])), ...filters.customer]);
    return {
      bands: PriorityBandSchema.options.filter((b) => bands.has(b)),
      statuses: InvoiceStatusSchema.options.filter((s) => statuses.has(s)),
      customers: [...ids]
        .map((id) => ({ id, name: customers?.get(id)?.name ?? id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [rows, customers, filters.band, filters.status, filters.customer]);

  const shown = useMemo(() => (rows ? filterExceptionRows(rows, filters) : []), [rows, filters]);

  if (rows === undefined) return <ExceptionsLoading />;
  if (rows.length === 0) return <ExceptionsEmpty filtered={false} />;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <FiltersPanel
        filters={filters}
        apply={apply}
        matched={shown.length}
        total={rows.length}
        bands={facets.bands}
        statuses={facets.statuses}
        customers={facets.customers}
      />
      {shown.length === 0 ? (
        <ExceptionsEmpty filtered onClear={() => apply(() => DEFAULT_FILTERS, "push")} />
      ) : (
        <ExceptionCards rows={shown} />
      )}
    </div>
  );
}

class ListBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] exceptions list failed to load", error);
  }
  render() {
    return this.state.failed ? <ExceptionsError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
