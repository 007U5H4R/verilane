/**
 * TASK-38: the sidebar's translucent count pill, and the icon rail's corner
 * badge. Only the full pill carries the `testId`, so the always-mounted copy
 * in the other nav never duplicates a test id. The value always comes from a
 * live count hook (QueueCount / DisputeCount / DraftCount), never a constant.
 */
export type CountBadgeProps = {
  /** Brighter pill on the active nav item. */
  active?: boolean;
  /** The icon rail's corner badge (no test id). */
  compact?: boolean;
  /** Lets the rail link reference the badge with `aria-describedby`. */
  id?: string;
};

export function CountBadge({
  count,
  testId,
  active = false,
  compact = false,
  id,
}: CountBadgeProps & { count: number; testId: string }) {
  if (compact) {
    return (
      <span
        id={id}
        className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border border-rail-deep bg-rail-mint px-1 text-[10px] font-bold leading-none tabular-nums text-rail-reset-text"
      >
        {count}
      </span>
    );
  }
  return (
    <span
      data-testid={testId}
      className={`ml-auto inline-flex h-[30px] min-w-[38px] shrink-0 items-center justify-center rounded-full px-2.5 text-[14px] font-semibold tabular-nums text-white transition-colors duration-200 motion-reduce:transition-none ${
        active ? "bg-white/20 ring-1 ring-white/20" : "bg-white/12"
      }`}
    >
      {count}
    </span>
  );
}
