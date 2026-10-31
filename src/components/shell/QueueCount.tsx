"use client";

import { useQueueCount } from "@/store/hooks";

/** The sidebar's live Queue count (TASK-9.5); nothing until it is known. */
export function QueueCount() {
  const count = useQueueCount();
  if (count === undefined) return null;
  return (
    <span className="ml-auto text-xs text-rail-muted" data-testid="queue-count">
      {count}
    </span>
  );
}
