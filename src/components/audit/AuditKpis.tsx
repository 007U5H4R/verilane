"use client";

import { useRef, type KeyboardEvent } from "react";
import { Activity, Bot, CircleCheck, User, type LucideIcon } from "lucide-react";
import type { AuditKpis as Kpis, KpiFilter } from "@/domain/audit/view";
import { cn } from "@/lib/cn";

interface Card {
  key: KpiFilter;
  label: string;
  hint: (k: Kpis) => string;
  value: (k: Kpis) => number;
  icon: LucideIcon;
}

const CARDS: Card[] = [
  {
    key: "all",
    label: "Total activities",
    value: (k) => k.total,
    hint: (k) => (k.unattributed > 0 ? `All workspace activity · ${k.unattributed} with no recorded actor` : "All workspace activity"),
    icon: Activity,
  },
  { key: "user", label: "User actions", value: (k) => k.user, hint: () => "Taken by a person (Analyst or Manager)", icon: User },
  { key: "system", label: "System actions", value: (k) => k.system, hint: () => "Automated processing", icon: Bot },
  { key: "approvals", label: "Approvals", value: (k) => k.approvals, hint: () => "Drafts approved, rejected or blocked", icon: CircleCheck },
];

/**
 * Four counts over all recorded workspace activity, each a filter. A single
 * choice, so it's a radio group (arrow keys move, Enter/Space selects).
 * User + System (+ unattributed) = Total; Approvals is a subset, not extra.
 */
export function AuditKpis({ kpis, value, onChange }: { kpis: Kpis; value: KpiFilter; onChange: (k: KpiFilter) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + CARDS.length) % CARDS.length;
    refs.current[next]?.focus();
    onChange(CARDS[next]!.key);
  };
  return (
    <div role="radiogroup" aria-label="Show activity" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((c, i) => {
        const on = value === c.key;
        const Icon = c.icon;
        return (
          <button
            key={c.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(c.key)}
            onKeyDown={(e) => onKey(e, i)}
            data-testid={`audit-kpi-${c.key}`}
            className={cn(
              "flex min-w-0 items-start gap-3 rounded-lg border bg-surface p-3 text-left shadow-card transition-colors md:p-4",
              on ? "border-brand ring-1 ring-brand" : "border-border hover:border-border-strong",
            )}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", on ? "bg-brand text-on-brand" : "bg-brand-tint text-brand-strong")}>
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-text-muted">{c.label}</span>
              <span className="font-display text-2xl font-semibold leading-tight tabular-nums text-text">{c.value(kpis)}</span>
              <span className="text-[11px] leading-snug text-text-muted">{c.hint(kpis)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
