"use client";

import { useState, type ReactNode } from "react";
import { Download, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditFilters, AuditSort, DatePreset, Option } from "@/domain/audit/view";
import { SORT_LABEL } from "@/domain/audit/view";
import { cn } from "@/lib/cn";

const DATE_LABEL: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom range",
};

const FIELD = "min-h-9 rounded-md border border-border bg-surface px-2 text-[13px] text-text";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs text-text-muted", className)}>
      {label}
      {children}
    </label>
  );
}

export interface ToolbarProps {
  filters: AuditFilters;
  onChange: (next: AuditFilters) => void;
  onClear: () => void;
  filtering: boolean;
  sort: AuditSort;
  onSort: (s: AuditSort) => void;
  actors: Option[];
  modules: Option[];
  actions: Option[];
  shown: number;
  total: number;
  onExport: () => void;
}

/**
 * Search, filters, sort and export. One set of controls at every width:
 * below md the filter panel folds behind a "Filters" toggle instead of being
 * duplicated into a separate drawer.
 */
export function AuditToolbar(p: ToolbarProps) {
  const [open, setOpen] = useState(false);
  const f = p.filters;
  const set = (patch: Partial<AuditFilters>) => p.onChange({ ...f, ...patch });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-card md:p-4" role="search" aria-label="Filter audit log">
      <div className="flex items-end gap-2">
        <Field label="Search audit log" className="flex-1">
          <span className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={f.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Search audit log (action, user, invoice...)"
              className={cn(FIELD, "w-full pl-8")}
            />
          </span>
        </Field>
        <Button
          variant="outline"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="audit-filter-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters
        </Button>
      </div>

      <div id="audit-filter-panel" className={cn("grid-cols-2 gap-3 md:grid md:grid-cols-3 lg:grid-cols-6", open ? "grid" : "hidden")}>
        <Field label="Date">
          <select
            value={f.date.preset}
            onChange={(e) => {
              const preset = e.target.value as DatePreset;
              set({ date: preset === "custom" ? { preset, from: f.date.from, to: f.date.to } : { preset } });
            }}
            className={FIELD}
          >
            {(Object.keys(DATE_LABEL) as DatePreset[]).map((d) => (
              <option key={d} value={d}>
                {DATE_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
        {f.date.preset === "custom" && (
          <>
            <Field label="From">
              <input
                type="date"
                value={f.date.from ?? ""}
                max={f.date.to || undefined}
                onChange={(e) => set({ date: { ...f.date, from: e.target.value || undefined } })}
                className={FIELD}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={f.date.to ?? ""}
                min={f.date.from || undefined}
                onChange={(e) => set({ date: { ...f.date, to: e.target.value || undefined } })}
                className={FIELD}
              />
            </Field>
          </>
        )}
        <Field label="User">
          <select value={f.actor} onChange={(e) => set({ actor: e.target.value })} className={FIELD}>
            <option value="">All users</option>
            {p.actors.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Module">
          <select value={f.module} onChange={(e) => set({ module: e.target.value as AuditFilters["module"] })} className={FIELD}>
            <option value="">All modules</option>
            {p.modules.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Action">
          <select value={f.action} onChange={(e) => set({ action: e.target.value })} className={FIELD}>
            <option value="">All types</option>
            {p.actions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort">
          <select value={p.sort} onChange={(e) => p.onSort(e.target.value as AuditSort)} className={FIELD}>
            {(Object.keys(SORT_LABEL) as AuditSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tabular-nums text-text-muted" aria-live="polite" data-testid="audit-count">
          {p.shown === p.total ? `${p.total} ${p.total === 1 ? "activity" : "activities"}` : `${p.shown} of ${p.total} activities`}
        </span>
        {p.filtering && (
          <Button variant="ghost" size="sm" onClick={p.onClear}>
            Clear all
          </Button>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={p.onExport} disabled={p.shown === 0}>
          <Download aria-hidden="true" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
