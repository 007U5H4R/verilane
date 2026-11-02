import type { ReactNode } from "react";

import { ageLabel, ageTone, type AgeTone } from "@/domain/disputes/model";
import type { DisputeStatus } from "@/domain/schema";
import { cn } from "@/lib/cn";
import { DISPUTE_STATUS_LABELS } from "./DisputeLabels";

/**
 * Status colour (TASK-38 brief): red needs a response, purple is under
 * review, amber waits on the customer, emerald is resolved, grey rejected.
 */
const STATUS_TONE: Record<DisputeStatus, { pill: string; dot: string }> = {
  new: { pill: "bg-high-bg text-high", dot: "bg-high" },
  under_review: { pill: "bg-disp-bg text-disp", dot: "bg-disp" },
  awaiting_customer: { pill: "bg-med-bg text-med", dot: "bg-med" },
  resolved: { pill: "bg-low-bg text-low", dot: "bg-low" },
  rejected: { pill: "bg-surface-sunken text-text-muted", dot: "bg-text-muted" },
};

/** A dot-badge status pill. The dot is decorative, so the text is exactly the label. */
export function StatusPill({ status, className, ...rest }: { status: DisputeStatus; className?: string; "data-testid"?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone.pill,
        className,
      )}
      {...rest}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      {DISPUTE_STATUS_LABELS[status]}
    </span>
  );
}

const AGE_TONE: Record<AgeTone, string> = {
  fresh: "bg-low-bg text-low",
  ageing: "bg-med-bg text-med",
  stale: "bg-high-bg text-high",
  unknown: "bg-surface-sunken text-text-muted",
};

/** Days since the dispute was raised, coloured by how long it has waited. */
export function AgePill({ age }: { age: number | null }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
        AGE_TONE[ageTone(age)],
      )}
    >
      {ageLabel(age)}
    </span>
  );
}

/** Small labelled block used inside the investigation panel. */
export function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className={cn("min-w-0 break-words text-sm text-text", mono && "font-mono text-[13px]")}>{children}</dd>
    </div>
  );
}

/**
 * Decorative header illustration: a document under review with a pair of
 * scales. Token colours only; hidden from assistive tech.
 */
export function DisputesArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 120" aria-hidden focusable="false" className={className}>
      <ellipse cx="118" cy="108" rx="92" ry="8" className="fill-brand-tint" />
      <rect x="62" y="14" width="78" height="92" rx="8" className="fill-surface stroke-border" strokeWidth="2" />
      <rect x="74" y="28" width="40" height="6" rx="3" className="fill-brand" />
      <rect x="74" y="42" width="54" height="4" rx="2" className="fill-border" />
      <rect x="74" y="52" width="48" height="4" rx="2" className="fill-border" />
      <rect x="74" y="62" width="52" height="4" rx="2" className="fill-border" />
      <rect x="74" y="78" width="30" height="14" rx="7" className="fill-high-bg" />
      <circle cx="82" cy="85" r="3" className="fill-high" />
      <g className="stroke-brand-strong" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M168 34v58" />
        <path d="M146 44h44" />
        <path d="M146 44l-10 22h20z" />
        <path d="M190 44l-10 22h20z" />
        <path d="M156 94h24" />
      </g>
      <path d="M136 66a10 5 0 0 0 20 0z" className="fill-mint" />
      <path d="M180 66a10 5 0 0 0 20 0z" className="fill-mint" />
      <circle cx="168" cy="30" r="5" className="fill-brand" />
      <circle cx="40" cy="40" r="14" className="fill-med-bg" />
      <path d="M40 32v9l5 3" className="stroke-med" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
