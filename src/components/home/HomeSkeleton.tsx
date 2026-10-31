/** Home-shaped loading placeholder (Design.md §18): a KPI strip of four
 * sunken cells, task cards and two chart blocks, so nothing jumps when the
 * real blocks render (T18-9). */
export function HomeSkeleton({ label = "Loading home" }: { label?: string }) {
  return (
    <div data-state="loading" aria-busy="true" aria-label={label} role="status" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex h-[76px] flex-col justify-center gap-2 rounded-lg bg-surface-sunken p-4">
            <span className="h-6 w-20 animate-pulse rounded bg-border" />
            <span className="h-3 w-16 animate-pulse rounded bg-border" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="h-4 w-40 animate-pulse rounded bg-surface-sunken" />
        {Array.from({ length: 2 }, (_, i) => (
          <span key={i} className="h-11 animate-pulse rounded-lg border border-border bg-surface-sunken" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <span className="h-4 w-48 animate-pulse rounded bg-surface-sunken" />
            <span className="h-56 animate-pulse rounded-lg bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
