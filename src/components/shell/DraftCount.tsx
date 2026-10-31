"use client";

import { useDraftCount } from "@/store/hooks";

export function DraftCount() {
  const count = useDraftCount();
  if (count === undefined) return null;
  return (
    <span className="ml-auto text-xs text-rail-muted" data-testid="draft-count">
      {count}
    </span>
  );
}
