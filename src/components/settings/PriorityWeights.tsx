import { Info } from "lucide-react";

import { cn } from "@/lib/cn";
import { bandRangeLabel, buildPriorityTable } from "@/domain/settings/priorityTable";

const BAND_DOT: Record<"high" | "medium" | "low", string> = {
  high: "bg-high",
  medium: "bg-med",
  low: "bg-low",
};

/**
 * Read-only view of the priority weights (TKT-14, TASK-38). Every number is
 * read from the scoring engine by `buildPriorityTable()`, so this card can't
 * drift from what the queue actually uses.
 */
export function PriorityWeights() {
  const table = buildPriorityTable();
  const [high, medium, low] = table.bands;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="rounded-md border border-border bg-mint-pale px-3 py-2 text-[13px] text-text">
        Config <span className="font-mono text-xs font-medium">{table.version}</span>. Read-only. Scores add up;{" "}
        {high.min} or more is High, {medium.min} to {medium.max} is Medium, below {low.max + 1} is Low. Data-quality,
        dispute and payment gates are checked before any score.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[22rem] text-left text-[13px]">
          <caption className="sr-only">Priority weights, {table.version}</caption>
          <thead className="bg-surface-sunken text-text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Factor</th>
              <th scope="col" className="px-3 py-2 font-medium">When</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={`${r.key}-${r.when}`} className={cn(r.first && "border-t border-border")}>
                <th scope="row" className="px-3 py-1.5 align-top font-medium text-text">
                  {r.first ? r.factor : <span className="sr-only">{r.factor}</span>}
                </th>
                <td className="px-3 py-1.5 text-text">{r.when}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums text-text">{r.pointsLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label="Priority bands" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text">
        {table.bands.map((b) => (
          <li key={b.band} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-full", BAND_DOT[b.band])} />
            {b.label} <span className="tabular-nums text-text-muted">{bandRangeLabel(b)}</span>
          </li>
        ))}
      </ul>
      <details className="group rounded-md border border-border text-[13px]">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 font-medium text-text hover:bg-surface-sunken">
          <Info aria-hidden className="size-4 text-info" />
          How the score works
        </summary>
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2 text-text-muted">
          <p>
            Each open invoice earns points from every factor above, and the points add up. A broken payment promise adds
            its points on top of the rest.
          </p>
          <p>
            Gates are checked first, in order, and an invoice that hits one gets that status instead of a score: closed
            or fully paid, an unknown status or a missing invoice number or due date (data quality), an open dispute, a
            payment to reconcile, not yet due, or an unbroken payment promise.
          </p>
        </div>
      </details>
    </div>
  );
}
