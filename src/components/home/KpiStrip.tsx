import Link from "next/link";
import { AlertTriangle, CalendarClock, IndianRupee, Scale, type LucideIcon } from "lucide-react";

import { DEFAULT_FILTERS, serialize } from "@/components/queue/queueParams";
import type { HomeKpis } from "@/domain/aggregates";
import { formatInr, paise } from "@/domain/money";
import { cn } from "@/lib/cn";

const TONES = {
  brand: "bg-brand-tint text-brand-strong",
  high: "bg-high-bg text-high",
  disp: "bg-disp-bg text-disp",
  med: "bg-med-bg text-med",
} as const;

interface Tile {
  id: string;
  label: string;
  value: string;
  caption: string;
  href: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
}

const queueHref = (patch: Partial<typeof DEFAULT_FILTERS>) => {
  const query = serialize({ ...DEFAULT_FILTERS, ...patch });
  return query ? `/queue?${query}` : "/queue";
};

/**
 * KPI strip (Design.md §14, TASK-38): four solid cards, each a link into the
 * view that explains its number. Values are the stored data only — no deltas
 * or trends. "Open disputes" is the open dispute-record count, the same
 * number as the sidebar Disputes badge (T18-10).
 */
export function KpiStrip({ kpis, openDisputesCount }: { kpis: HomeKpis; openDisputesCount: number }) {
  const tiles: Tile[] = [
    {
      id: "outstanding",
      label: "Outstanding",
      value: formatInr(paise(kpis.outstandingPaise)),
      caption: "Open invoices, after payments",
      href: queueHref({ sort: { column: "outstanding", desc: true } }),
      icon: IndianRupee,
      tone: "brand",
    },
    {
      id: "high",
      label: "High priority",
      value: String(kpis.highCount),
      caption: "Invoices needing a decision",
      href: queueHref({ band: ["high"] }),
      icon: AlertTriangle,
      tone: "high",
    },
    {
      id: "disputes",
      label: "Open disputes",
      value: String(openDisputesCount),
      caption: "Not yet resolved or rejected",
      href: "/disputes",
      icon: Scale,
      tone: "disp",
    },
    {
      id: "avg-days",
      label: "Avg days overdue",
      value: kpis.avgDaysOverdue === null ? "—" : String(Math.round(kpis.avgDaysOverdue)),
      caption: kpis.avgDaysOverdue === null ? "Nothing is overdue" : "Across overdue open invoices",
      href: queueHref({ sort: { column: "days_overdue", desc: true } }),
      icon: CalendarClock,
      tone: "med",
    },
  ];

  return (
    <ul data-testid="kpi-strip" aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.id} className="min-w-0">
          <Link
            href={t.href}
            data-testid={`kpi-${t.id}`}
            className={cn(
              "flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-sunken motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            )}
          >
            <span className="flex items-center gap-3">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONES[t.tone])}>
                <t.icon aria-hidden className="size-5" />
              </span>
              <span className="text-sm font-medium text-text-muted">{t.label}</span>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span
                data-testid={`kpi-${t.id}-value`}
                className="whitespace-nowrap font-display text-[22px] font-semibold leading-tight text-text tabular-nums md:text-[26px] xl:text-[22px] 2xl:text-[26px]"
              >
                {t.value}
              </span>
              <span className="text-xs text-text-muted">{t.caption}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
