import { Badge } from "@/components/ui/badge";
import type { PriorityBand } from "@/domain/schema";

// Labels mirror priority.ts's private bandLabel() — kept local to avoid
// widening the domain layer's public surface for a pure-presentation string.
const LABELS: Record<PriorityBand, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  needs_review: "Needs review",
  disputed: "Disputed",
  hold_reconcile: "Hold – reconcile",
  not_due: "Not due",
  on_hold_promised: "On hold – promised",
  closed: "Closed",
};

// Only high/medium/low/disputed have dedicated design tokens (globals.css);
// the rest fall back to the generic "outline" variant + muted dot rather
// than inventing new tokens no spec asked for.
const VARIANTS: Record<PriorityBand, "high" | "med" | "low" | "disp" | "outline"> = {
  high: "high",
  medium: "med",
  low: "low",
  needs_review: "outline",
  disputed: "disp",
  hold_reconcile: "outline",
  not_due: "outline",
  on_hold_promised: "outline",
  closed: "outline",
};

const DOT_COLORS: Record<PriorityBand, string> = {
  high: "var(--high)",
  medium: "var(--med)",
  low: "var(--low)",
  needs_review: "var(--text-muted)",
  disputed: "var(--disp)",
  hold_reconcile: "var(--text-muted)",
  not_due: "var(--text-muted)",
  on_hold_promised: "var(--text-muted)",
  closed: "var(--text-muted)",
};

/** Priority band as dot + label — never color alone (Design.md §13). */
export function PriorityChip({ band }: { band: PriorityBand }) {
  return (
    <Badge variant={VARIANTS[band]}>
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: DOT_COLORS[band] }}
      />
      {LABELS[band]}
    </Badge>
  );
}
