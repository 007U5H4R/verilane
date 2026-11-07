"use client";

import { CountBadge, type CountBadgeProps } from "@/components/shell/sidebar/CountBadge";
import { useExceptionCount } from "@/store/hooks";

/** Mirrors `DisputeCount.tsx` for the Exceptions nav item (TKT-75.02). */
export function ExceptionCount(props: CountBadgeProps) {
  const count = useExceptionCount();
  if (count === undefined) return null;
  return <CountBadge {...props} count={count} testId="exception-count" />;
}
