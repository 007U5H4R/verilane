"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DEFAULT_FILTERS, serialize } from "@/components/queue/queueParams";
import type { AgeingBucket, AgeingBucketCount } from "@/domain/aggregates";
import { formatInr, paise } from "@/domain/money";
import { cn } from "@/lib/cn";
import { CARD_CLASS, TOOLTIP_STYLES } from "./chartStyles";

const BUCKET_LABELS: Record<AgeingBucket, string> = {
  "1-15": "1–15 days",
  "16-30": "16–30 days",
  "31-60": "31–60 days",
  "60+": "60+ days",
};

function hrefFor(bucket: AgeingBucket): string {
  return `/queue?${serialize({ ...DEFAULT_FILTERS, ageing: [bucket] })}`;
}

/**
 * "Outstanding by ageing bucket" (Design.md §15): horizontal bars, each
 * linking into the Queue pre-filtered to that bucket. The SVG chart is
 * `aria-hidden` and duplicated by a real, keyboard-reachable link list,
 * since bar elements aren't reliably keyboard-operable.
 */
export function AgeingChart({ buckets }: { buckets: AgeingBucketCount[] }) {
  const router = useRouter();
  const data = buckets.map((b) => ({ ...b, label: BUCKET_LABELS[b.bucket] }));

  return (
    <section
      data-testid="ageing-chart"
      aria-labelledby="ageing-chart-title"
      className={cn(CARD_CLASS, "flex min-w-0 flex-col gap-3 p-4 sm:p-5")}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <h2 id="ageing-chart-title" className="text-base font-semibold text-text">
            Where is the money stuck?
          </h2>
          <p className="text-[13px] text-text-muted">Outstanding by ageing bucket (days overdue)</p>
        </div>
        <Link
          href="/invoices"
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          View all invoices <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {/* accessibilityLayer off: the SVG is aria-hidden, so it must not take focus (T18-3). */}
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 112, bottom: 8, left: 8 }}
            accessibilityLayer={false}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatInr(paise(v))}
              stroke="var(--text-muted)"
              fontSize={12}
            />
            <YAxis type="category" dataKey="label" stroke="var(--text-muted)" fontSize={12} width={88} />
            <Tooltip
              formatter={(v) => formatInr(paise(Number(v)))}
              cursor={{ fill: "var(--surface-sunken)" }}
              {...TOOLTIP_STYLES}
            />
            <Bar
              dataKey="outstandingPaise"
              name="Outstanding"
              fill="var(--brand)"
              radius={[0, 6, 6, 0]}
              cursor="pointer"
              onClick={(entry) => {
                const bucket = (entry as unknown as { payload: { bucket: AgeingBucket } }).payload.bucket;
                router.push(hrefFor(bucket));
              }}
            >
              {data.map((d) => (
                <Cell key={d.bucket} fill={d.bucket === "60+" ? "var(--high)" : "var(--brand)"} />
              ))}
              <LabelList
                dataKey="outstandingPaise"
                position="right"
                fill="var(--text-muted)"
                fontSize={12}
                formatter={(v) => formatInr(paise(Number(v)))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 text-[13px] sm:grid-cols-2 xl:grid-cols-1" data-testid="ageing-chart-fallback">
        {data.map((d) => (
          <li key={d.bucket}>
            <Link
              href={hrefFor(d.bucket)}
              className="inline-flex min-h-11 items-center rounded-md text-text-muted tabular-nums underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {d.label}: {formatInr(paise(d.outstandingPaise))} ({d.count})
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
