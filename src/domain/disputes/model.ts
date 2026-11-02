/**
 * Disputes page domain (TASK-38). Pure: no I/O, no React.
 *
 * One place for: which KPI group each dispute state belongs to, how old a
 * dispute is, the synthetic review team, and which resolution outcomes the
 * dispute state machine can actually honour.
 */
import { daysBetween } from "../clock";
import { transition } from "../transitions";
import type { DisputeStatus } from "../schema";

// --- KPI groups -------------------------------------------------------------

export type DisputeGroup = "needs_response" | "awaiting_customer" | "in_resolution" | "closed";

/**
 * Machine state → KPI group. `new` has not been picked up yet, so it needs a
 * response; `under_review` is being worked on; `awaiting_customer` waits on
 * the customer; `resolved` / `rejected` are closed.
 */
export const DISPUTE_GROUP: Record<DisputeStatus, DisputeGroup> = {
  new: "needs_response",
  under_review: "in_resolution",
  awaiting_customer: "awaiting_customer",
  resolved: "closed",
  rejected: "closed",
};

export function isOpen(status: DisputeStatus): boolean {
  return DISPUTE_GROUP[status] !== "closed";
}

/** Status filter: all, every open dispute, a KPI group, or one machine state. */
export type StatusFilter = "all" | "open" | DisputeGroup | DisputeStatus;

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open (not closed)" },
  { value: "new", label: "New — needs response" },
  { value: "under_review", label: "Under review — in resolution" },
  { value: "awaiting_customer", label: "Awaiting customer" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
];

export function matchesStatus(status: DisputeStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return isOpen(status);
  if (filter === status) return true;
  // A KPI group filter (the cards): match by group. Machine states that share
  // a name with a group (awaiting_customer) already matched above.
  return (filter === "needs_response" || filter === "in_resolution" || filter === "closed") && DISPUTE_GROUP[status] === filter;
}

// --- Age --------------------------------------------------------------------

export type AgeFilter = "all" | "today" | "le3" | "le7" | "le30" | "gt30";

export const AGE_FILTER_OPTIONS: ReadonlyArray<{ value: AgeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "le3", label: "Up to 3 days" },
  { value: "le7", label: "Up to 7 days" },
  { value: "le30", label: "Up to 30 days" },
  { value: "gt30", label: "Over 30 days" },
];

/**
 * Whole days from when the dispute was raised to the dataset's as-of date;
 * `null` when the raise time is unknown. Never negative (a raise dated after
 * the as-of date reads as 0 days).
 */
export function ageDays(createdAt: string | undefined, asOf: string): number | null {
  if (!createdAt) return null;
  return Math.max(0, daysBetween(createdAt, asOf));
}

/** Age buckets are cumulative ("up to N days"); an unknown age only matches All. */
export function matchesAge(age: number | null, filter: AgeFilter): boolean {
  if (filter === "all") return true;
  if (age === null) return false;
  switch (filter) {
    case "today":
      return age === 0;
    case "le3":
      return age <= 3;
    case "le7":
      return age <= 7;
    case "le30":
      return age <= 30;
    case "gt30":
      return age > 30;
  }
}

export type AgeTone = "fresh" | "ageing" | "stale" | "unknown";

/**
 * Age badge thresholds: up to 7 days is fresh (emerald), 8–14 days is ageing
 * (amber), over 14 days is stale (red). A closed dispute's age is shown but
 * never escalated.
 */
export const AGE_THRESHOLDS = { fresh: 7, ageing: 14 } as const;

export function ageTone(age: number | null): AgeTone {
  if (age === null) return "unknown";
  if (age <= AGE_THRESHOLDS.fresh) return "fresh";
  if (age <= AGE_THRESHOLDS.ageing) return "ageing";
  return "stale";
}

export function ageLabel(age: number | null): string {
  if (age === null) return "Age unknown";
  if (age === 0) return "Today";
  return age === 1 ? "1 day" : `${age} days`;
}

// --- Owner ------------------------------------------------------------------

/**
 * The synthetic dispute review team. The dataset carries no owners, so this
 * fixed list is the only source of reviewer names; a dispute is
 * "Unassigned" until someone assigns it with the audited `assign_dispute`
 * command. These are demo names, not real people.
 */
export const DISPUTE_TEAM = ["Ananya Rao", "Vikram Shah", "Meera Iyer", "Kabir Menon"] as const;
export type DisputeReviewer = (typeof DISPUTE_TEAM)[number];
export const UNASSIGNED = "Unassigned";

export function isDisputeReviewer(value: unknown): value is DisputeReviewer {
  return (DISPUTE_TEAM as readonly unknown[]).includes(value);
}

export function ownerLabel(assigned: string | undefined): string {
  return assigned && assigned.trim() !== "" ? assigned : UNASSIGNED;
}

// --- Resolution outcomes ------------------------------------------------------

export const RESOLUTION_CODES = [
  "invoice_corrected",
  "duplicate_confirmed",
  "payment_reconciled",
  "claim_rejected",
  "credit_note_required",
  "awaiting_info",
  "other",
] as const;
export type ResolutionCode = (typeof RESOLUTION_CODES)[number];

export function isResolutionCode(value: unknown): value is ResolutionCode {
  return (RESOLUTION_CODES as readonly unknown[]).includes(value);
}

export const RESOLUTION_LABELS: Record<ResolutionCode, string> = {
  invoice_corrected: "Invoice corrected",
  duplicate_confirmed: "Duplicate confirmed",
  payment_reconciled: "Payment reconciled",
  claim_rejected: "Claim rejected",
  credit_note_required: "Credit note required",
  awaiting_info: "Awaiting information from customer",
  other: "Other",
};

/**
 * How an outcome lands on the dispute machine. `resolve` / `reject` close the
 * dispute via `resolve_dispute` (Manager-only); `await_customer` keeps it
 * open via `dispute_transition`. No outcome touches the invoice: nothing is
 * marked paid and chasing does not resume.
 */
export const RESOLUTION_EFFECT: Record<ResolutionCode, "resolve" | "reject" | "await_customer"> = {
  invoice_corrected: "resolve",
  duplicate_confirmed: "resolve",
  payment_reconciled: "resolve",
  claim_rejected: "reject",
  credit_note_required: "resolve",
  awaiting_info: "await_customer",
  other: "resolve",
};

/** The `resolve_dispute` outcome an outcome code requires, or null if it is not a closing outcome. */
export function closingOutcome(code: ResolutionCode): "resolved" | "rejected" | null {
  const effect = RESOLUTION_EFFECT[code];
  if (effect === "resolve") return "resolved";
  if (effect === "reject") return "rejected";
  return null;
}

export type OutcomeAvailability = { available: true } | { available: false; reason: string };

/**
 * Whether an outcome can be recorded for a dispute in `status`, given what
 * the ledger holds. Pure — the caller supplies the facts.
 */
export function outcomeAvailability(
  code: ResolutionCode,
  facts: { status: DisputeStatus; ledgerPaymentCount: number; isManager: boolean },
): OutcomeAvailability {
  if (!isOpen(facts.status)) return { available: false, reason: "This dispute is already closed." };
  const effect = RESOLUTION_EFFECT[code];
  if (effect === "await_customer") {
    if (facts.status === "awaiting_customer") {
      return { available: false, reason: "Already waiting on the customer." };
    }
    return { available: true };
  }
  if (!facts.isManager) {
    return { available: false, reason: "Only a Manager can resolve or reject a dispute." };
  }
  if (code === "payment_reconciled" && facts.ledgerPaymentCount === 0) {
    return {
      available: false,
      reason: "No payment for this invoice is in the ledger. A customer saying they paid is not proof.",
    };
  }
  return { available: true };
}

/**
 * The machine events that take a dispute from `status` to where `code` needs
 * it. From `new`, review starts first (its own audited step).
 */
export function eventsFor(code: ResolutionCode, status: DisputeStatus): string[] {
  const effect = RESOLUTION_EFFECT[code];
  const lead = status === "new" ? ["start_review"] : status === "awaiting_customer" && effect !== "await_customer" ? ["customer_replied"] : [];
  return [...lead, effect];
}

// --- Bulk status change -------------------------------------------------------

/** The status changes a bulk action may apply: only open, non-closing moves. */
export const BULK_STATUS_EVENTS = [
  { event: "start_review", label: "Start review (→ Under review)" },
  { event: "await_customer", label: "Wait on customer (→ Awaiting customer)" },
  { event: "customer_replied", label: "Customer replied (→ Under review)" },
] as const;
export type BulkStatusEvent = (typeof BULK_STATUS_EVENTS)[number]["event"];

/** Whether the dispute machine allows `event` from `status`. */
export function canApply(status: DisputeStatus, event: string): boolean {
  try {
    transition("dispute", status, event);
    return true;
  } catch {
    return false;
  }
}
