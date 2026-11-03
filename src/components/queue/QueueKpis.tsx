"use client";

import type { ComponentType, ReactNode } from "react";
import { Flag, Layers, Scale, TriangleAlert } from "lucide-react";

import { formatInr } from "@/domain/money";
import type { PriorityBand } from "@/domain/schema";
import { cn } from "@/lib/cn";
import type { ApplyFilters } from "./FiltersPanel";
import type { QueueKpis as Kpis } from "./queueActions";

type Card = {
  key: string;
  /** The band this card filters to; `null` = every band (Total). */
  band: PriorityBand | null;
  label: string;
  value: number;
  sub: ReactNode;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: { icon: string; card: string };
};

/**
 * Four compact KPI cards (TASK-38), computed from the whole queue (not the
 * current page). Each is a toggle: it applies its band filter, and pressing
 * the active one again clears it. Total is a static summary.
 */
export function QueueKpis({ kpis, band, apply }: { kpis: Kpis; band: PriorityBand[]; apply: ApplyFilters }) {
  const cards: Card[] = [
    {
      key: "total",
      band: null,
      label: "Total in Queue",
      value: kpis.total,
      sub: <span className="tabular-nums">{formatInr(kpis.outstanding)} outstanding</span>,
      icon: Layers,
      tone: { icon: "bg-mint-pale text-brand-strong", card: "border-mint" },
    },
    {
      key: "high",
      band: "high",
      label: "High Priority",
      value: kpis.high,
      sub: <Chip className="bg-high-bg text-high">Needs decision</Chip>,
      icon: Flag,
      tone: { icon: "bg-high-bg text-high", card: "border-border" },
    },
    {
      key: "needs_review",
      band: "needs_review",
      label: "Needs Review",
      value: kpis.needsReview,
      sub: <Chip className="bg-med-bg text-med">Requires attention</Chip>,
      icon: TriangleAlert,
      tone: { icon: "bg-med-bg text-med", card: "border-border" },
    },
    {
      key: "disputed",
      band: "disputed",
      label: "Disputed",
      value: kpis.disputed,
      sub: <Chip className="bg-disp-bg text-disp">Resolution required</Chip>,
      icon: Scale,
      tone: { icon: "bg-disp-bg text-disp", card: "border-border" },
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Queue summary" data-testid="queue-kpis">
      {cards.map((c) => {
        const pressed = band.length === 1 && band[0] === c.band;
        const Icon = c.icon;
        const inner = (
          <>
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", c.tone.icon)}>
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-medium text-text-muted">{c.label}</span>
              <span className="text-2xl font-semibold leading-none tabular-nums text-text">{c.value}</span>
              <span className="break-words text-xs text-text-muted">{c.sub}</span>
            </span>
          </>
        );
        const base = "flex h-full w-full items-start gap-3 rounded-lg border bg-surface p-4 text-left shadow-card";
        const only = c.band;
        return (
          <li key={c.key} className="min-w-0" data-testid={`queue-kpi-${c.key}`}>
            {only === null ? (
              // Total is a summary, not a control: clearing the band filter
              // already has "All" in the Priority group (no duplicate no-op button).
              <div className={cn(base, c.tone.card)}>{inner}</div>
            ) : (
              <button
                type="button"
                aria-pressed={pressed}
                onClick={() =>
                  apply(
                    (prev) => ({
                      ...prev,
                      band: prev.band.length === 1 && prev.band[0] === only ? [] : [only],
                      page: 1,
                    }),
                    "push",
                  )
                }
                className={cn(
                  base,
                  "transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive",
                  c.tone.card,
                  pressed && "ring-2 ring-brand",
                )}
              >
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex max-w-full rounded-md px-1.5 py-0.5 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}
