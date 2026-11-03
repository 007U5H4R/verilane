import { CircleCheck, CircleDashed, CircleHelp, CircleX, Clock, Info, type LucideIcon } from "lucide-react";

import type { Tone } from "@/domain/payments/reconcile";
import { cn } from "@/lib/cn";

/**
 * Semantic colour for the payments page. Colour is never the only signal:
 * every tone carries an icon and its text label beside it.
 * emerald = verified, amber = pending, red = mismatch, purple = ambiguous,
 * grey = unknown, blue = info.
 */
export const TONE: Record<Tone, { chip: string; icon: LucideIcon; bar: string }> = {
  verified: { chip: "bg-low-bg text-low", icon: CircleCheck, bar: "bg-low" },
  pending: { chip: "bg-med-bg text-med", icon: Clock, bar: "bg-med" },
  mismatch: { chip: "bg-high-bg text-high", icon: CircleX, bar: "bg-high" },
  ambiguous: { chip: "bg-disp-bg text-disp", icon: CircleHelp, bar: "bg-disp" },
  unknown: { chip: "bg-surface-sunken text-text-muted", icon: CircleDashed, bar: "bg-border-strong" },
  info: { chip: "bg-info-bg text-info", icon: Info, bar: "bg-info" },
};

/** A status chip: icon + label, coloured by tone. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <span
      data-tone={tone}
      className={cn("inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", t.chip, className)}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}
