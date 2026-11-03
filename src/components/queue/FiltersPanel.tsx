"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, Filter, Search, X } from "lucide-react";

import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import type { InvoiceStatus, PriorityBand } from "@/domain/schema";
import { cn } from "@/lib/cn";
import { BAND_LABELS } from "./PriorityChip";
import { AGEING_BUCKETS, DEFAULT_FILTERS, activeFilterCount, type QueueFilters } from "./queueParams";

// Phone-only bottom sheet, loaded on demand (keeps /queue under its first-load budget).
const FilterSheet = dynamic(() => import("./FilterSheet").then((m) => m.FilterSheet), { ssr: false });
// The customer list only exists while the picker is open; loaded on first open.
const CustomerPickerList = dynamic(() => import("./CustomerPickerList").then((m) => m.CustomerPickerList), {
  ssr: false,
});

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  written_off: "Written off",
  unknown: "Unknown",
};

export const AGEING_LABELS: Record<(typeof AGEING_BUCKETS)[number], string> = {
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

type FacetKey = "band" | "status" | "customer" | "ageing";

const PHONE_QUERY = "(max-width: 767px)";
function subscribePhone(cb: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** True below `md`; the server snapshot is desktop (inline filters). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/**
 * Search + facet filters for the Queue (TASK-9.3, restyled TASK-38). Inline
 * and collapsible at md+; below md the same facet groups move into a bottom
 * sheet (native modal <dialog>) opened by the same toggle. Each facet has an
 * "All" chip that clears it; active filters show as removable chips with a
 * result count. Any filter change returns to page 1.
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
  const phone = useIsPhone();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = phone ? sheetOpen : desktopOpen;
  const count = activeFilterCount(filters);

  // The input keeps its own text while focused so slow URL updates never
  // fight the caret; otherwise it follows the URL (Clear filters, Back).
  const [text, setText] = useState(filters.q);
  const [focused, setFocused] = useState(false);
  if (!focused && text !== filters.q) setText(filters.q);

  function toggle<K extends FacetKey>(key: K, value: QueueFilters[K][number]) {
    apply((prev) => {
      const current = prev[key] as string[];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next, page: 1 };
    }, "push");
  }
  function clearFacet(key: FacetKey) {
    apply((prev) => ({ ...prev, [key]: [], page: 1 }), "push");
  }
  const clearAll = () => apply((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort }), "push");

  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.q.trim() !== ""
      ? [{ key: "q", label: `“${filters.q.trim()}”`, remove: () => apply((prev) => ({ ...prev, q: "", page: 1 }), "push") }]
      : []),
    ...filters.band.map((b) => ({ key: `band-${b}`, label: BAND_LABELS[b], remove: () => toggle("band", b) })),
    ...filters.status.map((s) => ({ key: `status-${s}`, label: STATUS_LABELS[s], remove: () => toggle("status", s) })),
    ...filters.ageing.map((a) => ({ key: `ageing-${a}`, label: AGEING_LABELS[a], remove: () => toggle("ageing", a) })),
    ...filters.customer.map((c) => ({
      key: `customer-${c}`,
      label: customerName.get(c) ?? c,
      remove: () => toggle("customer", c),
    })),
  ];

  const groups = (
    <div className="flex flex-col gap-3">
      <FacetGroup label="Priority" allActive={filters.band.length === 0} onAll={() => clearFacet("band")}>
        {bands.map((b) => (
          <Pill key={b} pressed={filters.band.includes(b)} onClick={() => toggle("band", b)}>
            {BAND_LABELS[b]}
          </Pill>
        ))}
      </FacetGroup>
      <FacetGroup label="Status" allActive={filters.status.length === 0} onAll={() => clearFacet("status")}>
        {statuses.map((s) => (
          <Pill key={s} pressed={filters.status.includes(s)} onClick={() => toggle("status", s)}>
            {STATUS_LABELS[s]}
          </Pill>
        ))}
      </FacetGroup>
      <FacetGroup label="Overdue" allActive={filters.ageing.length === 0} onAll={() => clearFacet("ageing")}>
        {AGEING_BUCKETS.map((a) => (
          <Pill key={a} pressed={filters.ageing.includes(a)} onClick={() => toggle("ageing", a)}>
            {AGEING_LABELS[a]}
          </Pill>
        ))}
      </FacetGroup>
      <CustomerPicker
        customers={customers}
        selected={filters.customer}
        onToggle={(id) => toggle("customer", id)}
        onClear={() => clearFacet("customer")}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-1.5">
          <Search aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
          <span className="sr-only">Search customers or invoices</span>
          <input
            type="search"
            value={text}
            placeholder="Search customer or invoice no..."
            className="min-h-7 min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
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
          onClick={() => (phone ? setSheetOpen((o) => !o) : setDesktopOpen((o) => !o))}
        >
          <Filter aria-hidden="true" className="size-4" />
          {open ? "Hide filters" : "Show filters"}
          {count > 0 && <span data-testid="active-filter-count">({count})</span>}
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {phone ? (
        <FilterSheet id={bodyId} open={sheetOpen} onClose={() => setSheetOpen(false)} matched={matched}>
          {groups}
        </FilterSheet>
      ) : (
        <div id={bodyId} hidden={!desktopOpen} className="border-t border-border pt-3">
          {groups}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="text-[13px] text-text-muted" data-testid="result-count">
          {matched} of {total} shown
        </p>
        {chips.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.key}>
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-tint py-0.5 pl-2 pr-0.5 text-xs font-medium text-text">
                  <span className="max-w-40 truncate">{c.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove filter: ${c.label}`}
                    onClick={c.remove}
                    className="grid size-6 place-items-center rounded text-text-muted hover:bg-surface-sunken hover:text-text"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {count > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

function FacetGroup({
  label,
  allActive,
  onAll,
  children,
}: {
  label: string;
  allActive: boolean;
  onAll: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 md:flex-row md:items-center">
      <span id={id} className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {/* "All" clears the facet; with nothing selected it is the current state, so it is disabled (no no-op control). */}
        <Pill pressed={allActive} disabled={allActive} onClick={onAll}>
          All
        </Pill>
        {children}
      </div>
    </div>
  );
}

function Pill({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-8 rounded-md border px-3 py-1 text-xs font-medium transition-colors",
        pressed
          ? "border-brand bg-brand text-on-brand"
          : "border-border bg-surface text-text-muted hover:bg-surface-sunken hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Customer facet as a searchable multi-select: the trigger reads "All
 * customers" or the selection; the popover holds a search box and the
 * `group "Customer"` of aria-pressed buttons (the facet contract the specs
 * read). Escape or a click outside closes it and focus returns to the trigger.
 */
function CustomerPicker({
  customers,
  selected,
  onToggle,
  onClear,
}: {
  customers: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const labelId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const names = new Map(customers.map((c) => [c.id, c.name]));
  const summary =
    selected.length === 0
      ? "All customers"
      : selected.length === 1
        ? (names.get(selected[0]!) ?? selected[0]!)
        : `${selected.length} customers`;

  return (
    <div className="flex flex-col gap-1.5 md:flex-row md:items-center">
      <span id={labelId} className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-text-muted">
        Customer
      </span>
      <div
        ref={rootRef}
        className="relative"
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            e.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`Customer: ${summary}`}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex min-h-8 max-w-64 items-center gap-2 rounded-md border px-3 py-1 text-xs font-medium",
            selected.length > 0 ? "border-brand bg-brand-tint text-text" : "border-border bg-surface text-text-muted",
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0", open && "rotate-180")} />
        </button>
        {open && (
          <CustomerPickerList
            id={listId}
            labelId={labelId}
            customers={customers}
            selected={selected}
            onToggle={onToggle}
            onClear={onClear}
          />
        )}
      </div>
    </div>
  );
}
