"use client";

import { formatDate } from "@/components/investigation/DocumentCard";
import { useAsOf } from "@/store/hooks";

/** "As of 30 Oct 2026", following the Settings override live (TC-061). */
export function AsOfLabel({ className }: { className?: string }) {
  const asOf = useAsOf();
  return (
    <p className={className} data-testid="as-of-label">
      As of {formatDate(asOf)}
    </p>
  );
}
