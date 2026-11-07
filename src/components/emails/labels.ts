/**
 * Display labels for Email Conversations (TASK-38). The extraction class
 * labels mirror `CLASS_LABEL` / `CLASS_VARIANT` in
 * `investigation/CommunicationTable.tsx` (not exported there), so an email
 * reads the same on the invoice page and here.
 */
import type { IntentFilter, LinkedFilter } from "@/domain/emails/listing";
import { EXCEPTION_KIND_LABEL } from "@/domain/exceptions/list";
import type { EmailClass, MatchOutcome, ExceptionKind, SignalFamily } from "@/domain/schema";

export type BadgeVariant = "default" | "high" | "med" | "low" | "disp" | "outline";

export const CLASS_LABEL: Record<EmailClass, string> = {
  commitment: "Commitment",
  confirmation: "Payment claimed",
  dispute: "Dispute",
  duplicate: "Duplicate",
  delay: "Delay",
  enquiry: "Enquiry",
  unknown: "Unclassified",
};

export const CLASS_VARIANT: Record<EmailClass, BadgeVariant> = {
  commitment: "low",
  confirmation: "low",
  dispute: "disp",
  duplicate: "disp",
  delay: "med",
  enquiry: "default",
  unknown: "outline",
};

export const INTENT_LABEL: Record<IntentFilter, string> = { ...CLASS_LABEL, rejected: "Rejected extraction" };

export const OUTCOME_LABEL: Record<MatchOutcome, string> = {
  matched: "Matched",
  ambiguous: "Ambiguous match",
  customer_only: "Customer only",
  unresolved: "Unresolved",
};

export const OUTCOME_VARIANT: Record<MatchOutcome, BadgeVariant> = {
  matched: "low",
  ambiguous: "med",
  customer_only: "med",
  unresolved: "high",
};

export const LINKED_LABEL: Record<LinkedFilter, string> = {
  invoice: "Linked to an invoice",
  dispute: "Linked to a dispute",
  review: "Open review item",
  unlinked: "No linked invoice",
};

// One definition, in the domain (TKT-75.02): the /exceptions list searches it too.
export const REVIEW_KIND_LABEL: Record<ExceptionKind, string> = EXCEPTION_KIND_LABEL;

export const SIGNAL_LABEL: Record<SignalFamily, string> = {
  dispute: "Dispute",
  duplicate: "Duplicate",
  confirmation: "Payment claim",
  commitment: "Commitment",
  delay: "Delay",
  enquiry: "Enquiry",
  missing_info: "Missing information",
};
