import Link from "next/link";
import { ArrowRight, ChevronDown, CircleCheck } from "lucide-react";

import { DEFAULT_FILTERS, serialize } from "@/components/queue/queueParams";
import type { AttentionGroup, AttentionKey } from "@/domain/home/attention";
import { formatInr } from "@/domain/money";
import { cn } from "@/lib/cn";
import { CARD_CLASS } from "./chartStyles";

const GROUP_META: Record<AttentionKey, { dot: string; href: string; linkLabel: (n: number) => string }> = {
  high: {
    dot: "bg-high",
    href: `/queue?${serialize({ ...DEFAULT_FILTERS, band: ["high"] })}`,
    linkLabel: (n) => `See all ${n} in the queue`,
  },
  disputed: {
    dot: "bg-disp",
    href: `/queue?${serialize({ ...DEFAULT_FILTERS, band: ["disputed"] })}`,
    linkLabel: (n) => `See all ${n} in the queue`,
  },
  drafts: { dot: "bg-brand", href: "/drafts", linkLabel: (n) => `Review all ${n} in Drafts` },
  payments: { dot: "bg-med", href: "/payments", linkLabel: (n) => `Review all ${n} in Payments` },
  exceptions: { dot: "bg-med", href: "/exceptions", linkLabel: (n) => `Review all ${n} in Exceptions` },
};

const LINK =
  "rounded-md font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * "Needs your attention" (Design.md §14, TASK-38): one solid card per group
 * of waiting work — high-priority decisions, disputed invoices, reminder
 * drafts awaiting approval, payment emails needing review. Each is a
 * keyboard-native `<details>` (closed by default) whose summary is a count +
 * verb sentence; opening it lists the first items and a link to the full
 * filtered list. No groups → the designed empty card.
 */
export function TaskFeed({ groups }: { groups: AttentionGroup[] }) {
  return (
    <section aria-labelledby="task-feed-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="task-feed-title" className="text-lg font-semibold text-text">
          Needs your attention
        </h2>
        <Link href="/emails" className={cn(LINK, "inline-flex min-h-11 items-center gap-1 text-sm")}>
          View all emails <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {groups.length === 0 ? (
        <div className={cn(CARD_CLASS, "flex items-start gap-4 p-5")}>
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-strong">
            <CircleCheck aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-text" data-testid="task-feed-empty">
              Nothing needs your attention
            </p>
            <p className="text-sm text-text-muted">
              No high-priority invoices, disputed invoices, drafts awaiting approval or payment emails to review.
            </p>
          </div>
        </div>
      ) : (
        <div data-testid="task-feed" className="flex flex-col gap-3">
          {groups.map((group) => (
            <FeedGroup key={group.key} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}

function FeedGroup({ group }: { group: AttentionGroup }) {
  const meta = GROUP_META[group.key];
  return (
    <details className={cn(CARD_CLASS, "group overflow-hidden")} data-testid={`feed-${group.key}`}>
      <summary
        className={cn(
          "flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-text [&::-webkit-details-marker]:hidden",
          "rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
          "hover:bg-surface-sunken",
        )}
      >
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} />
        <span className="min-w-0 flex-1 font-semibold">{group.summary}</span>
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-border px-4 pb-4">
        <ul className="divide-y divide-border">
          {group.entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <div className="flex min-w-0 flex-1 basis-40 flex-col">
                <span className="truncate text-sm font-semibold text-text">{entry.title}</span>
                <span className="truncate text-[13px] text-text-muted">{entry.detail}</span>
              </div>
              <span className="text-sm font-medium text-text tabular-nums">
                {entry.amountPaise === null ? "Not available." : formatInr(entry.amountPaise)}
              </span>
              {entry.daysOverdue !== null && (
                <span className="rounded-full bg-high-bg px-2 py-0.5 text-xs font-medium text-high tabular-nums">
                  {`${entry.daysOverdue} ${entry.daysOverdue === 1 ? "day" : "days"} overdue`}
                </span>
              )}
              <Link
                href={entry.href}
                className={cn(LINK, "inline-flex min-h-11 items-center px-1 text-sm")}
                aria-label={`Review ${entry.detail} — ${entry.title}`}
              >
                Review
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={meta.href}
          className={cn(LINK, "inline-flex min-h-11 items-center gap-1 text-sm")}
          data-testid={`feed-${group.key}-link`}
        >
          {meta.linkLabel(group.total)} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </details>
  );
}
