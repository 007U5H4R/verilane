import type { ComponentPropsWithoutRef } from "react";

import type { PriorityBand } from "@/domain/schema";
import { cn } from "@/lib/cn";
import { BAND_LABELS } from "./PriorityChip";

/**
 * Queue priority badge (TASK-38): tinted pill with a dot + label, so the band
 * never reads by colour alone. Bands without a dedicated token (hold, not due,
 * promised, closed) use the sunken surface + muted text (the disabled pair is
 * 4.28:1, under AA — caught by TC-080).
 * `data-slot="badge"` matches the shared Badge so row-level e2e selectors
 * (tracer, trust-walk) keep finding the row's priority badge.
 */
const TONES: Record<PriorityBand, { badge: string; dot: string }> = {
  high: { badge: "bg-high-bg text-high", dot: "bg-high" },
  medium: { badge: "bg-med-bg text-med", dot: "bg-med" },
  low: { badge: "bg-low-bg text-low", dot: "bg-low" },
  needs_review: { badge: "bg-med-bg text-med", dot: "bg-med" },
  disputed: { badge: "bg-disp-bg text-disp", dot: "bg-disp" },
  hold_reconcile: { badge: "bg-surface-sunken text-text-muted", dot: "bg-text-muted" },
  not_due: { badge: "bg-surface-sunken text-text-muted", dot: "bg-text-muted" },
  on_hold_promised: { badge: "bg-surface-sunken text-text-muted", dot: "bg-text-muted" },
  closed: { badge: "bg-surface-sunken text-text-muted", dot: "bg-text-muted" },
};

export function BandBadge({
  band,
  className,
  children,
  ...rest
}: { band: PriorityBand } & ComponentPropsWithoutRef<"span">) {
  const tone = TONES[band];
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        tone.badge,
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      {BAND_LABELS[band]}
      {children}
    </span>
  );
}
