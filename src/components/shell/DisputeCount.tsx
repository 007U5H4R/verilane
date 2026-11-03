"use client";

import { CountBadge, type CountBadgeProps } from "@/components/shell/sidebar/CountBadge";
import { useDisputeCount } from "@/store/hooks";

/** Mirrors `QueueCount.tsx` for the Disputes nav item (TASK-17.3). */
export function DisputeCount(props: CountBadgeProps) {
  const count = useDisputeCount();
  if (count === undefined) return null;
  return <CountBadge {...props} count={count} testId="dispute-count" />;
}
