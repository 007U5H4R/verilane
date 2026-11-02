const BAR = "animate-pulse rounded bg-surface-sunken motion-reduce:animate-none";
const RAIL_BAR = "animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none";
const CARD = "rounded-2xl border border-border bg-surface shadow-card";

/** TASK-43: the page body while the workspace opens — a heading, four KPI
 * cards and one list card. Route-neutral: the page's own skeleton takes over
 * once its chunk loads. */
export function ContentSkeleton() {
  return (
    <div aria-hidden className="flex min-w-0 flex-col gap-6 p-4 md:p-7">
      <span className={`h-7 w-48 ${BAR}`} />
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${CARD} flex flex-col gap-3 p-4`}>
            <span className={`h-3.5 w-24 ${BAR}`} />
            <span className={`h-7 w-32 ${BAR}`} />
          </div>
        ))}
      </div>
      <div className={`${CARD} flex flex-col`}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-4 border-b border-border px-4 last:border-b-0">
            <span className={`h-5 w-16 rounded-full ${BAR}`} />
            <span className={`h-3.5 flex-1 ${BAR}`} />
            <span className={`hidden h-3.5 w-24 sm:block ${BAR}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * TASK-43: the whole app frame as placeholders — sidebar (≥1024) or icon rail
 * (768–1023), top bar, page body, bottom tabs (<768) — on the same grid as
 * AppShell, so the real shell paints over it without a jump.
 */
export function ShellSkeleton({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-state="loading"
      className="grid min-h-dvh grid-cols-1 bg-canvas md:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)]"
    >
      <div
        aria-hidden
        className="hidden h-dvh flex-col items-center gap-3 bg-gradient-to-b from-rail-deep to-rail-dark px-2 py-4 md:sticky md:top-0 md:flex lg:items-stretch lg:px-4"
      >
        <span className={`mb-3 size-9 rounded-full lg:mx-auto lg:h-12 lg:w-[180px] lg:rounded-xl ${RAIL_BAR}`} />
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={`size-10 lg:h-10 lg:w-full ${RAIL_BAR}`} />
        ))}
      </div>
      <div className="flex min-w-0 flex-col pb-16 md:pb-0">
        <div
          aria-hidden
          className="flex h-[60px] items-center gap-3 border-b border-topbar-divider bg-topbar px-3 md:h-[68px] md:px-6 lg:h-[76px] lg:px-7"
        >
          <span className={`size-9 ${BAR}`} />
          <span className={`h-4 w-28 ${BAR}`} />
          <span className={`ml-auto size-10 md:w-56 ${BAR}`} />
          <span className={`size-10 rounded-full ${BAR}`} />
        </div>
        <ContentSkeleton />
      </div>
      <div
        aria-hidden
        className="fixed inset-x-0 bottom-0 grid h-16 grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="flex flex-col items-center justify-center gap-1.5">
            <span className={`size-5 ${BAR}`} />
            <span className={`h-2.5 w-10 ${BAR}`} />
          </span>
        ))}
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
