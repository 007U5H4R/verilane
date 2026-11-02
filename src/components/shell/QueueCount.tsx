"use client";

import { CountBadge, type CountBadgeProps } from "@/components/shell/sidebar/CountBadge";
import { useQueueCount } from "@/store/hooks";

/** The sidebar's live Queue count (TASK-9.5); nothing until it is known. */
export function QueueCount(props: CountBadgeProps) {
  const count = useQueueCount();
  if (count === undefined) return null;
  return <CountBadge {...props} count={count} testId="queue-count" />;
}
