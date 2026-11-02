"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DEFAULT_FILTERS, serialize } from "@/components/queue/queueParams";
import { PRIORITY_MIX_BANDS, type PriorityMixBand, type PriorityMixCount } from "@/domain/aggregates";
import type { PriorityBand } from "@/domain/schema";
import { cn } from "@/lib/cn";
import { CARD_CLASS, TOOLTIP_STYLES } from "./chartStyles";

const BAND_LABELS: Record<PriorityMixBand, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  disputed: "Disputed",
};

const BAND_COLORS: Record<PriorityMixBand, string> = {
  high: "var(--high)",
  medium: "var(--med)",
  low: "var(--low)",
  disputed: "var(--disp)",
};

function hrefFor(band: PriorityMixBand): string {
  return `/queue?${serialize({ ...DEFAULT_FILTERS, band: [band as PriorityBand] })}`;
}

/**
 * "Priority mix of the queue" (Design.md §15): one stacked bar, High /
 * Medium / Low / Disputed, each segment and legend item linking into the
 * Queue filtered to that band. Legend is always labelled (never colour-only). The SVG is
 * `aria-hidden` and duplicated by a real, keyboard-reachable link list.
 */
export function PriorityMixChart({ mix }: { mix: PriorityMixCount[] }) {
  const router = useRouter();
  const data: Record<string, string | number>[] = [
    { name: "Queue", ...Object.fromEntries(mix.map((m) => [m.band, m.count])) },
  ];

  return (
    <section
      data-testid="priority-mix-chart"
      aria-labelledby="priority-mix-title"
      className={cn(CARD_CLASS, "flex min-w-0 flex-col gap-3 p-4 sm:p-5")}
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="priority-mix-title" className="text-base font-semibold text-text">
          Priority mix of the queue
        </h2>
        <p className="text-[13px] text-text-muted">Open invoices by priority band</p>
      </div>
      <div className="h-24 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {/* accessibilityLayer off: the SVG is aria-hidden, so it must not take focus (T18-3). */}
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
            accessibilityLayer={false}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip cursor={false} {...TOOLTIP_STYLES} />
            <Legend
              wrapperStyle={{ cursor: "pointer" }}
              onClick={(entry) => {
                const band = PRIORITY_MIX_BANDS.find((b) => b === entry.dataKey);
                if (band) router.push(hrefFor(band));
              }}
            />
            {mix.map((m) => (
              <Bar
                key={m.band}
                dataKey={m.band}
                name={BAND_LABELS[m.band]}
                stackId="mix"
                fill={BAND_COLORS[m.band]}
                stroke="var(--surface)"
                cursor="pointer"
                onClick={() => router.push(hrefFor(m.band))}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 text-[13px] sm:grid-cols-4" data-testid="priority-mix-fallback">
        {mix.map((m) => (
          <li key={m.band}>
            <Link
              href={hrefFor(m.band)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md text-text-muted tabular-nums underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: BAND_COLORS[m.band] }} />
              {BAND_LABELS[m.band]}: {m.count}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
