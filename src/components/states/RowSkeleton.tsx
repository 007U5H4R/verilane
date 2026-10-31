/** Loading placeholder rows shaped like Queue row cards (TASK-9.4). */
export function RowSkeleton({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div data-state="loading" aria-busy="true" aria-label={label} role="status" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-16 items-center gap-4 border-b border-border px-4">
          <span className="h-5 w-16 animate-pulse rounded-full bg-surface-sunken" />
          <span className="h-3.5 w-20 animate-pulse rounded bg-surface-sunken" />
          <span className="h-3.5 flex-1 animate-pulse rounded bg-surface-sunken" />
          <span className="h-3.5 w-24 animate-pulse rounded bg-surface-sunken" />
          <span className="h-3.5 w-28 animate-pulse rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}
