"use client";

import { useDraftCount } from "@/store/hooks";

export function DraftCount() {
  const count = useDraftCount();
  if (count === undefined) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-white/10 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-rail-text" data-testid="draft-count">
      {count}
    </span>
  );
}
