const CARD = "rounded-2xl border border-border bg-surface shadow-card";
const BAR = "animate-pulse rounded bg-surface-sunken motion-reduce:animate-none";

/** Home-shaped loading placeholder (Design.md §18, TASK-38): four KPI cards,
 * then the attention feed beside the two chart cards — the same grid as the
 * working page, so nothing jumps when the real blocks render (T18-9). */
export function HomeSkeleton({ label = "Loading home" }: { label?: string }) {
  return (
    <div data-state="loading" aria-busy="true" aria-label={label} role="status" className="flex min-w-0 flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${CARD} flex flex-col gap-3 p-4`}>
            <span className="flex items-center gap-3">
              <span className={`size-10 shrink-0 rounded-xl ${BAR}`} />
              <span className={`h-3.5 w-24 ${BAR}`} />
            </span>
            <span className={`h-7 w-36 ${BAR}`} />
            <span className={`h-3 w-32 ${BAR}`} />
          </div>
        ))}
      </div>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-3">
          <span className={`h-7 w-48 ${BAR}`} />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={`${CARD} flex min-h-14 items-center gap-3 px-4`}>
              <span className={`size-2.5 rounded-full ${BAR}`} />
              <span className={`h-4 w-2/3 ${BAR}`} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <div className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`}>
            <span className={`h-5 w-52 ${BAR}`} />
            <span className={`h-56 ${BAR}`} />
          </div>
          <div className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`}>
            <span className={`h-5 w-48 ${BAR}`} />
            <span className={`h-24 ${BAR}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
