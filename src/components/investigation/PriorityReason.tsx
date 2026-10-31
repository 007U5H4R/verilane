import type { Priority } from "@/domain/schema";

/**
 * Why this invoice sits where it does: the reason, the recommended action,
 * and each scoring factor with its points (Design.md §14). Gated priorities
 * carry no factors; their reason says why.
 */
export function PriorityReason({ priority }: { priority: Priority }) {
  return (
    <section
      aria-labelledby="h-priority-reason"
      className="mt-5 rounded-md bg-surface-sunken px-4 py-3"
    >
      <h2 id="h-priority-reason" className="text-sm font-semibold text-text">
        Why this priority
      </h2>
      <p data-testid="priority-reason" className="mt-1 text-text">
        {priority.reason}
      </p>
      <p className="mt-1 text-text-muted">
        Recommended action: <span className="text-text">{priority.recommended_action}</span>
      </p>
      {priority.factors.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Score factors">
          {priority.factors.map((f) => (
            <li
              key={f.name}
              className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-text"
            >
              <span className="tabular-nums">+{f.points}</span> {f.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
