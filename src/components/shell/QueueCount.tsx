"use client";

import { useQueueCount } from "@/store/hooks";

/** The sidebar's live Queue count (TASK-9.5); nothing until it is known. */
export function QueueCount() {
  const count = useQueueCount();
  if (count === undefined) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-white/10 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-rail-text" data-testid="queue-count">
      {count}
    </span>
  );
}
