"use client";

import { useId, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { InvoiceStatus, PriorityBand } from "@/domain/schema";
import { BAND_LABELS } from "./PriorityChip";
import { AGEING_BUCKETS, DEFAULT_FILTERS, activeFilterCount, type QueueFilters } from "./queueParams";

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  written_off: "Written off",
  unknown: "Unknown",
};

const AGEING_LABELS: Record<(typeof AGEING_BUCKETS)[number], string> = {
  "1-15": "1–15 days",
  "16-30": "16–30 days",
  "31-60": "31–60 days",
  "60+": "60+ days",
};

/**
 * `update` gets the latest requested filters, not the render-time URL, so
 * rapid clicks compose. `push` adds a history entry (facets, Clear);
 * `replace` doesn't (typing).
 */
export type ApplyFilters = (update: (prev: QueueFilters) => QueueFilters, mode: "push" | "replace") => void;

/**
 * Search + facet filters for the Queue (TASK-9.3). Collapsible ("Hide
 * filters"); when collapsed the toggle still shows how many are active.
 * Any filter change returns to page 1.
 */
export function FiltersPanel({
  filters,
  apply,
  matched,
  total,
  bands,
  statuses,
  customers,
}: {
  filters: QueueFilters;
  apply: ApplyFilters;
  matched: number;
  total: number;
  /** Facet values present in the data (plus any already selected). */
  bands: PriorityBand[];
  statuses: InvoiceStatus[];
  customers: { id: string; name: string }[];
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  const count = activeFilterCount(filters);

  // The input keeps its own text while focused so slow URL updates never
  // fight the caret; otherwise it follows the URL (Clear filters, Back).
  const [text, setText] = useState(filters.q);
  const [focused, setFocused] = useState(false);
  if (!focused && text !== filters.q) setText(filters.q);

  function toggle<K extends "band" | "status" | "customer" | "ageing">(key: K, value: QueueFilters[K][number]) {
    apply((prev) => {
      const current = prev[key] as string[];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next, page: 1 };
    }, "push");
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-1.5">
          <Search aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
          <span className="sr-only">Search customers or invoices</span>
          <input
            type="search"
            value={text}
            placeholder="Search customer or invoice no."
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => {
              const q = e.target.value;
              setText(q);
              apply((prev) => ({ ...prev, q, page: 1 }), "replace");
            }}
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide filters" : "Show filters"}
          {count > 0 && <span data-testid="active-filter-count">({count})</span>}
        </Button>
        {count > 0 && (
          <Button variant="ghost" size="sm" onClick={() => apply((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort }), "push")}>
            Clear filters
          </Button>
        )}
      </div>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-3">
        <FacetGroup label="Priority">
          {bands.map((b) => (
            <Pill key={b} pressed={filters.band.includes(b)} onClick={() => toggle("band", b)}>
              {BAND_LABELS[b]}
            </Pill>
          ))}
        </FacetGroup>
        <FacetGroup label="Status">
          {statuses.map((s) => (
            <Pill key={s} pressed={filters.status.includes(s)} onClick={() => toggle("status", s)}>
              {STATUS_LABELS[s]}
            </Pill>
          ))}
        </FacetGroup>
        <FacetGroup label="Overdue">
          {AGEING_BUCKETS.map((a) => (
            <Pill key={a} pressed={filters.ageing.includes(a)} onClick={() => toggle("ageing", a)}>
              {AGEING_LABELS[a]}
            </Pill>
          ))}
        </FacetGroup>
        <FacetGroup label="Customer">
          {customers.map((c) => (
            <Pill key={c.id} pressed={filters.customer.includes(c.id)} onClick={() => toggle("customer", c.id)}>
              {c.name}
            </Pill>
          ))}
        </FacetGroup>
      </div>
      <p role="status" className="text-[13px] text-text-muted" data-testid="result-count">
        {matched} of {total} shown
      </p>
    </div>
  );
}

function FacetGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span id={id} className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

function Pill({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-8 rounded-full border px-3 py-1 text-xs ${
        pressed ? "border-brand bg-brand-tint font-semibold text-text" : "border-border bg-surface text-text-muted hover:bg-surface-sunken"
      }`}
    >
      {children}
    </button>
  );
}
