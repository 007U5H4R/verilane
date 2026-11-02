"use client";

import { useDisputeCount } from "@/store/hooks";

/** Mirrors `QueueCount.tsx` for the Disputes nav item (TASK-17.3). */
export function DisputeCount() {
  const count = useDisputeCount();
  if (count === undefined) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-white/10 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-rail-text" data-testid="dispute-count">
      {count}
    </span>
  );
}
