"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DEFAULT_FILTERS, serialize } from "@/components/queue/queueParams";
import type { PriorityMixBand, PriorityMixCount } from "@/domain/aggregates";
import type { PriorityBand } from "@/domain/schema";

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
 * Medium / Low / Disputed, each segment linking into the Queue filtered to
 * that band. Legend is always labelled (never colour-only). The SVG is
 * `aria-hidden` and duplicated by a real, keyboard-reachable link list.
 */
export function PriorityMixChart({ mix }: { mix: PriorityMixCount[] }) {
  const router = useRouter();
  const data: Record<string, string | number>[] = [
    { name: "Queue", ...Object.fromEntries(mix.map((m) => [m.band, m.count])) },
  ];

  return (
    <div data-testid="priority-mix-chart" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-text">Priority mix of the queue</h2>
      <div className="h-24 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip />
            <Legend formatter={(value: string) => BAND_LABELS[value as PriorityMixBand] ?? value} />
            {mix.map((m) => (
              <Bar
                key={m.band}
                dataKey={m.band}
                name={m.band}
                stackId="mix"
                fill={BAND_COLORS[m.band]}
                cursor="pointer"
                onClick={() => router.push(hrefFor(m.band))}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-3 text-[13px]" data-testid="priority-mix-fallback">
        {mix.map((m) => (
          <li key={m.band}>
            <Link href={hrefFor(m.band)} className="text-text-muted underline-offset-2 hover:underline">
              {BAND_LABELS[m.band]}: {m.count}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
