import type { Dispute } from "@/domain/schema";

/** Human-readable dispute type, mirroring `BAND_LABELS` (PriorityChip.tsx). */
export const DISPUTE_TYPE_LABELS: Record<Dispute["type"], string> = {
  duplicate_invoice: "Duplicate invoice",
  incorrect_amount: "Incorrect amount",
  incorrect_billing_period: "Incorrect billing period",
  missing_po: "Missing PO",
  not_received: "Not received",
  payment_already_completed: "Payment already completed",
  unknown: "Unspecified",
};

/** Human-readable dispute status, for the list and detail views (TASK-17.3). */
export const DISPUTE_STATUS_LABELS: Record<Dispute["status"], string> = {
  new: "New",
  under_review: "Under review",
  awaiting_customer: "Awaiting customer",
  resolved: "Resolved",
  rejected: "Rejected",
};

/** Badge variant per status: open statuses read as attention, closed ones as settled. */
export const DISPUTE_STATUS_VARIANT: Record<Dispute["status"], "disp" | "med" | "low"> = {
  new: "disp",
  under_review: "med",
  awaiting_customer: "med",
  resolved: "low",
  rejected: "low",
};
