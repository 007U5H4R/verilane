import Link from "next/link";

import { PriorityChip } from "@/components/queue/PriorityChip";
import { DEFAULT_FILTERS, serialize } from "@/components/queue/queueParams";
import type { RankItem } from "@/domain/priority";
import type { PriorityBand } from "@/domain/schema";

interface FeedGroup {
  key: string;
  band: PriorityBand;
  noun: string;
  /** Verb for one item / for several ("needs" / "need"). */
  verb: { one: string; many: string };
  items: RankItem[];
}

/**
 * "Needs your attention" task feed (Design.md §14): a `<details>` card per
 * group, keyboard-native (no custom disclosure JS). The summary is a count
 * + verb sentence; expanding lists the top items and a link into the
 * filtered Queue. Scoped to what's derivable from `useQueue()` alone
 * (high-priority, open disputes) — drafts/unmatched-payment task cards
 * belong to other lanes (TASK-16) and aren't part of this ticket's AC.
 */
export function TaskFeed({ items }: { items: RankItem[] }) {
  const allGroups: FeedGroup[] = [
    {
      key: "high",
      band: "high",
      noun: "high-priority invoice",
      verb: { one: "needs a decision", many: "need a decision" },
      items: items.filter((i) => i.priority.band === "high"),
    },
    {
      key: "disputed",
      band: "disputed",
      noun: "disputed invoice",
      verb: { one: "needs dispute resolution", many: "need dispute resolution" },
      items: items.filter((i) => i.priority.band === "disputed"),
    },
  ];
  const groups = allGroups.filter((g) => g.items.length > 0);

  return (
    <section aria-labelledby="task-feed-title" className="flex flex-col gap-2">
      <h2 id="task-feed-title" className="text-sm font-medium text-text">
        Needs your attention
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="task-feed-empty">
          Nothing needs your attention
        </p>
      ) : (
        <FeedGroups groups={groups} />
      )}
    </section>
  );
}

function FeedGroups({ groups }: { groups: FeedGroup[] }) {
  return (
    <div data-testid="task-feed" className="flex flex-col gap-2">
      {groups.map((group) => (
        <details key={group.key} className="rounded-lg border border-border bg-surface p-3" data-testid={`feed-${group.key}`}>
          <summary className="cursor-pointer text-sm font-medium text-text">
            {group.items.length === 1
              ? `1 ${group.noun} ${group.verb.one}`
              : `${group.items.length} ${group.noun}s ${group.verb.many}`}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {group.items.slice(0, 5).map((item) => (
              <li key={item.invoice.invoice_id} className="flex items-center gap-2 text-[13px] text-text-muted">
                <PriorityChip band={item.priority.band} />
                <span>{item.invoice.invoice_number ?? item.invoice.invoice_id}</span>
              </li>
            ))}
          </ul>
          <Link
            href={`/queue?${serialize({ ...DEFAULT_FILTERS, band: [group.band] })}`}
            className="mt-2 inline-block text-[13px] text-brand underline-offset-2 hover:underline"
            data-testid={`feed-${group.key}-link`}
          >
            View in Queue →
          </Link>
        </details>
      ))}
    </div>
  );
}
