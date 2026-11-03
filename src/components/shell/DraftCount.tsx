"use client";

import { CountBadge, type CountBadgeProps } from "@/components/shell/sidebar/CountBadge";
import { useDraftCount } from "@/store/hooks";

export function DraftCount(props: CountBadgeProps) {
  const count = useDraftCount();
  if (count === undefined) return null;
  return <CountBadge {...props} count={count} testId="draft-count" />;
}
