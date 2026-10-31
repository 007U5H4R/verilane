"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DEFAULT_FILTERS, serialize } from "@/components/queue/queueParams";
import type { AgeingBucket, AgeingBucketCount } from "@/domain/aggregates";
import { formatInr, paise } from "@/domain/money";
import { TOOLTIP_STYLES } from "./chartStyles";

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
    <div data-testid="ageing-chart" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-text">Outstanding by ageing bucket</h2>
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {/* accessibilityLayer off: the SVG is aria-hidden, so it must not take focus (T18-3). */}
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 112, bottom: 8, left: 8 }}
            accessibilityLayer={false}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatInr(paise(v))}
              stroke="var(--text-muted)"
              fontSize={12}
            />
            <YAxis type="category" dataKey="label" stroke="var(--text-muted)" fontSize={12} width={88} />
            <Tooltip formatter={(v) => formatInr(paise(Number(v)))} {...TOOLTIP_STYLES} />
            <Legend formatter={() => "Outstanding"} />
            <Bar
              dataKey="outstandingPaise"
              name="Outstanding"
              fill="var(--brand)"
              cursor="pointer"
              onClick={(entry) => {
                const bucket = (entry as unknown as { payload: { bucket: AgeingBucket } }).payload.bucket;
                router.push(hrefFor(bucket));
              }}
            >
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
      <ul className="flex flex-col gap-1 text-[13px]" data-testid="ageing-chart-fallback">
        {data.map((d) => (
          <li key={d.bucket}>
            <Link href={hrefFor(d.bucket)} className="text-text-muted underline-offset-2 hover:underline">
              {d.label}: {formatInr(paise(d.outstandingPaise))} ({d.count})
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
