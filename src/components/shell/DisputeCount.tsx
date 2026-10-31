"use client";

import { useDisputeCount } from "@/store/hooks";

/** Mirrors `QueueCount.tsx` for the Disputes nav item (TASK-17.3). */
export function DisputeCount() {
  const count = useDisputeCount();
  if (count === undefined) return null;
  return (
    <span className="ml-auto text-xs text-rail-muted" data-testid="dispute-count">
      {count}
    </span>
  );
}
