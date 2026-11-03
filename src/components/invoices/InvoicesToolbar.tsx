"use client";

import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AGEING_BUCKETS,
  DEFAULT_DESC,
  SORT_KEYS,
  SORT_LABEL,
  STATUS_LABEL,
  type AgeingBucket,
  type RegisterParams,
  type RegisterSort,
  type SortKey,
} from "@/domain/invoices/register";
import type { InvoiceStatus } from "@/domain/schema";
import { cn } from "@/lib/cn";

const FIELD = "min-h-11 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text md:min-h-9";

const STATUSES = Object.keys(STATUS_LABEL) as InvoiceStatus[];

const AGEING_LABEL: Record<AgeingBucket, string> = {
  "1-15": "1–15 days overdue",
  "16-30": "16–30 days overdue",
  "31-60": "31–60 days overdue",
  "60+": "Over 60 days overdue",
};

/** Sort select options: each key in its useful-first direction, then the reverse. */
const SORT_OPTIONS: { value: string; label: string }[] = SORT_KEYS.flatMap((k: SortKey) => {
  const dirs = DEFAULT_DESC[k] ? [true, false] : [false, true];
  return dirs.map((desc) => ({ value: `${k}.${desc ? "desc" : "asc"}`, label: `${SORT_LABEL[k]} ${dirLabel(k, desc)}` }));
});

function dirLabel(k: SortKey, desc: boolean): string {
  if (k === "amount") return desc ? "(high to low)" : "(low to high)";
  if (k === "overdue") return desc ? "(most first)" : "(least first)";
  if (k === "due") return desc ? "(latest first)" : "(earliest first)";
  return desc ? "(Z to A)" : "(A to Z)";
}

/** A sibling <label htmlFor>, not a wrapping one, so option text doesn't fold into the label. */
function Field({ label, id, children, className }: { label: string; id: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 text-xs text-text-muted", className)}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export interface InvoicesToolbarProps {
  params: RegisterParams;
  customers: { id: string; name: string | null }[];
  onChange: (patch: Partial<RegisterParams>, mode?: "push" | "replace") => void;
  onClear: () => void;
  filtering: boolean;
  shown: number;
  total: number;
}

/**
 * Search, filters and sort. One set of controls at every width: below md the
 * filter panel folds behind a "Filters" toggle. The customer filter also
 * shows as a removable chip, so a `?customer=` deep link says what it hides.
 */
export function InvoicesToolbar(p: InvoicesToolbarProps) {
  const [open, setOpen] = useState(false);

  const customerName = p.params.customer
    ? (p.customers.find((c) => c.id === p.params.customer)?.name ?? null)
    : null;
  const knownCustomer = p.params.customer ? p.customers.some((c) => c.id === p.params.customer) : true;
  const sortValue = (s: RegisterSort) => `${s.key}.${s.desc ? "desc" : "asc"}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-card md:p-4" role="search" aria-label="Filter invoices">
      <div className="flex items-end gap-2">
        <Field label="Search invoices" id="invoices-q" className="flex-1">
          <span className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-text-muted" aria-hidden="true" />
            <input
              id="invoices-q"
              type="search"
              value={p.params.q}
              // `replace`: no history entry per keystroke.
              onChange={(e) => p.onChange({ q: e.target.value }, "replace")}
              placeholder="Invoice number or customer"
              className={cn(FIELD, "pl-8")}
            />
          </span>
        </Field>
        <Button
          variant="outline"
          className="min-h-11 md:hidden"
          aria-expanded={open}
          aria-controls="invoices-filter-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters
        </Button>
      </div>

      <div id="invoices-filter-panel" className={cn("grid-cols-1 gap-3 sm:grid-cols-2 md:grid md:grid-cols-4", open ? "grid" : "hidden")}>
        <Field label="Status" id="invoices-status">
          <select
            id="invoices-status"
            value={p.params.status ?? ""}
            onChange={(e) => p.onChange({ status: (e.target.value || null) as InvoiceStatus | null })}
            className={FIELD}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ageing" id="invoices-ageing">
          <select
            id="invoices-ageing"
            value={p.params.ageing ?? ""}
            onChange={(e) => p.onChange({ ageing: (e.target.value || null) as AgeingBucket | null })}
            className={FIELD}
          >
            <option value="">Any ageing</option>
            {AGEING_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {AGEING_LABEL[b]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Customer" id="invoices-customer">
          <select
            id="invoices-customer"
            value={p.params.customer ?? ""}
            onChange={(e) => p.onChange({ customer: e.target.value || null })}
            className={FIELD}
          >
            <option value="">All customers</option>
            {!knownCustomer && p.params.customer && <option value={p.params.customer}>{p.params.customer} (no invoices)</option>}
            {p.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? `${c.id} (name not available)`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort by" id="invoices-sort">
          <select
            id="invoices-sort"
            value={sortValue(p.params.sort)}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(".") as [SortKey, string];
              p.onChange({ sort: { key, desc: dir === "desc" } });
            }}
            className={FIELD}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tabular-nums text-text-muted" aria-live="polite" data-testid="invoices-count">
          {p.shown === p.total ? `${p.total} ${p.total === 1 ? "invoice" : "invoices"}` : `${p.shown} of ${p.total} invoices`}
        </span>
        {p.params.customer && (
          <span
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand bg-brand-tint py-0.5 pl-3 pr-1 text-xs font-medium text-brand-strong"
            data-testid="invoices-customer-chip"
          >
            <span className="truncate">Customer: {customerName ?? `${p.params.customer} (name not available)`}</span>
            <button
              type="button"
              onClick={() => p.onChange({ customer: null })}
              aria-label={`Remove customer filter: ${customerName ?? p.params.customer}`}
              className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface md:size-6"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
        {p.filtering && (
          <Button variant="ghost" size="sm" onClick={p.onClear} className="max-md:min-h-11">
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
