/**
 * Single source of truth for the domain's shapes (Data-Model.md §1). Every
 * `type X = z.infer<...>` below is inferred, never hand-declared, so the
 * runtime schema and the compile-time type can't drift apart.
 */
import { z } from "zod";

// Integer paise, branded at the parse boundary so a parsed amount is `Paise`
// (money.ts) without a cast. `.brand()` is type-only: no runtime transform.
const paiseAmount = z.number().int().brand<"Paise">();

// ISO `YYYY-MM-DD` business date, compared as a UTC day number (clock.ts).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
// ISO-8601 UTC timestamp (email send times, audit events).
const isoTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, "expected ISO-8601 UTC");

// --- Source entities (Data-Model.md §2) -----------------------------------

export const CustomerSchema = z.object({
  customer_id: z.string(),
  name: z.string(),
  contact_emails: z.array(z.string()),
  payment_terms_days: z.number().int(),
  segment: z.string(),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const InvoiceStatusSchema = z.enum([
  "open",
  "partially_paid",
  "paid",
  "written_off",
  "unknown",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceSchema = z.object({
  row_id: z.number().int(),
  invoice_id: z.string(),
  invoice_number: z.string().nullable(), // FS1 when null; unique when present.
  customer_id: z.string(),
  invoice_date: isoDate,
  due_date: isoDate.nullable(), // FS2 when null.
  amount_paise: paiseAmount,
  currency: z.string().nullable(), // null → check 4 fails.
  status_raw: z.string(),
  status: InvoiceStatusSchema, // FS10 (unrecognized status_raw) → "unknown".
  billing_period: z.string().nullable(),
  po_number: z.string().nullable(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const PaymentSchema = z.object({
  payment_id: z.string(),
  // null = unapplied cash: received but not yet allocated to an invoice
  // (TASK-79.1, TC-003). Every reader handles null explicitly.
  invoice_id: z.string().nullable(),
  paid_on: isoDate,
  amount_paise: paiseAmount, // partial payments allowed (FS8).
  // TASK-79.8 (EXE160): who the bank says paid, and the reference the
  // remittance cites, both verbatim. Optional: absent when the bank line
  // carries neither (a v1 row is unchanged). Never fuzzy-matched.
  payer_customer_id: z.string().min(1).optional(),
  remittance_reference: z.string().min(1).optional(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const EmailMessageSchema = z.object({
  thread_id: z.string(),
  message_id: z.string(),
  from_address: z.string(),
  sent_at: isoTimestamp,
  subject: z.string(),
  body: z.string(),
});
export type EmailMessage = z.infer<typeof EmailMessageSchema>;

// --- Derived entities (Data-Model.md §3) ----------------------------------

export const DataIssueKindSchema = z.enum(["missing", "conflict", "unparseable", "invalid"]); // invalid: row failed schema validation and was skipped (R9).
export type DataIssueKind = z.infer<typeof DataIssueKindSchema>;

export const DataIssueSchema = z.object({
  issue_id: z.string(),
  record_id: z.string(),
  field: z.string(),
  kind: DataIssueKindSchema,
  message: z.string(),
  suggested_action: z.string(),
});
export type DataIssue = z.infer<typeof DataIssueSchema>;

export const PriorityBandSchema = z.enum([
  "high",
  "medium",
  "low",
  "needs_review",
  "disputed",
  "hold_reconcile",
  "not_due",
  "on_hold_promised",
  "closed",
]);
export type PriorityBand = z.infer<typeof PriorityBandSchema>;

export const PriorityFactorSchema = z.object({
  name: z.string(),
  points: z.number(),
  evidenceId: z.string(),
});
export type PriorityFactor = z.infer<typeof PriorityFactorSchema>;

export const PrioritySchema = z.object({
  invoice_id: z.string(),
  config_version: z.string(),
  band: PriorityBandSchema,
  score: z.number().optional(),
  factors: z.array(PriorityFactorSchema),
  gate: z.string().optional(),
  reason: z.string(),
  recommended_action: z.string(),
  days_overdue: z.number().nullable(),
});
export type Priority = z.infer<typeof PrioritySchema>;

export const EvidenceSourceTypeSchema = z.enum(["invoice", "customer", "payment", "email"]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;

export const EvidenceValidationStatusSchema = z.enum([
  "verified",
  "conflict",
  "missing",
  "unsupported",
]);
export type EvidenceValidationStatus = z.infer<typeof EvidenceValidationStatusSchema>;

export const EvidenceSchema = z.object({
  evidence_id: z.string(),
  claim_id: z.string(),
  claim_text: z.string(),
  source_type: EvidenceSourceTypeSchema,
  source_record_id: z.string(),
  source_row_or_email_id: z.string(),
  source_field: z.string(),
  original_value: z.unknown(),
  validation_status: EvidenceValidationStatusSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// --- Extraction (Data-Model.md §3, TASK-12) -------------------------------

export const EmailClassSchema = z.enum([
  "commitment",
  "confirmation",
  "dispute",
  "duplicate",
  "delay",
  "enquiry",
  "unknown",
]);
export type EmailClass = z.infer<typeof EmailClassSchema>;

export const DisputeTypeSchema = z.enum([
  "duplicate_invoice",
  "incorrect_amount",
  "incorrect_billing_period",
  "missing_po",
  "not_received",
  "payment_already_completed",
  "unknown",
]);
export type DisputeType = z.infer<typeof DisputeTypeSchema>;

/** Phrase families the classifier detects (phrases.ts). */
export const SignalFamilySchema = z.enum([
  "dispute",
  "duplicate",
  "confirmation",
  "commitment",
  "delay",
  "enquiry",
  "missing_info",
]);
export type SignalFamily = z.infer<typeof SignalFamilySchema>;

export const EXTRACTION_SCHEMA_VERSION = "extraction.v1";

export const PaymentClaimSchema = z.object({
  paid_on: isoDate.nullable(),
  amount_paise: z.number().int().nonnegative().nullable(),
});
export type PaymentClaim = z.infer<typeof PaymentClaimSchema>;

export const ExtractionSchema = z
  .object({
    message_id: z.string().min(1),
    thread_id: z.string().min(1),
    mode: z.enum(["simulated", "live"]),
    provider: z.string().min(1),
    model: z.string().optional(),
    schemaVersion: z.literal(EXTRACTION_SCHEMA_VERSION),
    email_class: EmailClassSchema,
    signals: z.array(SignalFamilySchema),
    invoice_refs: z.array(z.string().regex(/^INV-\d+$/, "expected INV-<digits>")),
    amounts: z.array(z.number().int().nonnegative()),
    dates: z.array(isoDate),
    /** Promised date (commitment), or the claimed payment date (confirmation / already-paid dispute). */
    commitment_date: isoDate.nullable(),
    payment_claim: PaymentClaimSchema.nullable(),
    dispute_type: DisputeTypeSchema.optional(),
    missing_info: z.array(z.string()),
    status: z.enum(["valid", "rejected"]),
    rejection_reason: z.string().optional(),
  })
  .superRefine((x, ctx) => {
    const needsType = x.email_class === "dispute" || x.email_class === "duplicate";
    if (needsType !== (x.dispute_type !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["dispute_type"],
        message: "dispute_type is required for dispute/duplicate and forbidden otherwise",
      });
    }
    if ((x.status === "rejected") !== (x.rejection_reason !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["rejection_reason"],
        message: "rejection_reason is required iff status is rejected",
      });
    }
  });
export type Extraction = z.infer<typeof ExtractionSchema>;

// --- Match / Exception (Data-Model.md §3–4, TASK-13) ----------------------

export const MatchOutcomeSchema = z.enum(["matched", "ambiguous", "customer_only", "unresolved"]);
export type MatchOutcome = z.infer<typeof MatchOutcomeSchema>;

export const MatchSchema = z.object({
  message_id: z.string().min(1),
  outcome: MatchOutcomeSchema,
  customer_id: z.string().optional(),
  /** Set only when `outcome` is `matched`. */
  invoice_id: z.string().optional(),
  /** invoice_ids a reviewer should look at: cited, foreign, or transposition suspects. */
  candidates: z.array(z.string()),
  reason: z.string(),
});
export type Match = z.infer<typeof MatchSchema>;

export const ExceptionKindSchema = z.enum([
  "draft",
  "uncertain_match",
  "dispute",
  "missing_info",
  "reconciliation",
  // TASK-75 (TKT-75.01): raised from the payments ledger, not an email.
  "unallocated_payment",
  "short_payment_pattern",
]);
export type ExceptionKind = z.infer<typeof ExceptionKindSchema>;

/** The kinds raised from payments rather than an email: `message_id` is optional for these only. */
export const PAYMENT_EXCEPTION_KINDS = ["unallocated_payment", "short_payment_pattern"] as const;
export type PaymentExceptionKind = (typeof PAYMENT_EXCEPTION_KINDS)[number];
export function isPaymentExceptionKind(kind: ExceptionKind): kind is PaymentExceptionKind {
  return (PAYMENT_EXCEPTION_KINDS as readonly string[]).includes(kind);
}

/**
 * Persisted in the `exceptions` table (v1: `reviewItems`). Field names
 * (`review_id`, `linked_review_ids`) and `RV-` ids are kept from v1 so
 * stored rows, audit subjects and test ids stay valid (EXE119).
 */
export const ExceptionSchema = z.object({
  review_id: z.string().min(1),
  kind: ExceptionKindSchema,
  /** The email that raised it. Required for every email-raised kind; optional for payment kinds (refined below). */
  message_id: z.string().min(1).optional(),
  /** The invoice it concerns, when one is known. */
  invoice_id: z.string().optional(),
  /** Items the same email raised about other invoices (FS6 duplicate pair). */
  linked_review_ids: z.array(z.string()),
  recommendation: z.string(),
  evidence_ids: z.array(z.string()),
  validation_status: EvidenceValidationStatusSchema,
  escalation_reason: z.string(),
  requires_role: z.enum(["analyst", "manager"]),
  status: z.enum(["open", "actioned", "dismissed"]),
  /** Reconciliation only: the email's claim and the ledger's outstanding, side by side. */
  email_amount_paise: z.number().int().nonnegative().brand<"Paise">().optional(),
  ledger_outstanding_paise: paiseAmount.optional(),
  /** Payment kinds only: the bank line that raised it (TKT-75.02, EXE124). */
  payment_id: z.string().min(1).optional(),
  /** Payment kinds only: open invoices the payment could settle, in ledger order. */
  candidate_invoice_ids: z.array(z.string()).optional(),
  /** TKT-75.06 (EXE140): why the item is open again; set by `reverse_allocation`. */
  reopen_reason: z.enum(["reversed"]).optional(),
  /** TKT-75.06 (EXE140): sticky — an allocation on this item was reversed at some point. Not by itself "not correctly resolved": NSM pairs `allocate_payment` events with `reverse_allocation` via `after.reverses_event_id`. */
  reversed: z.boolean().optional(),
}).superRefine((x, ctx) => {
  if (x.message_id === undefined && !isPaymentExceptionKind(x.kind)) {
    ctx.addIssue({ code: "custom", path: ["message_id"], message: `${x.kind} exceptions need the email that raised them` });
  }
});
export type Exception = z.infer<typeof ExceptionSchema>;

/** An exception raised by an email (every v1 kind): `message_id` is always set (the refinement above). */
export type EmailException = Exception & { message_id: string };
export function isEmailException(x: Exception): x is EmailException {
  return !isPaymentExceptionKind(x.kind) && x.message_id !== undefined;
}

// --- Drafts and the nine pre-approval checks (TASK-15) ---------------------

export const VerifiedFactKindSchema = z.enum([
  "invoice_number",
  "customer_name",
  "amount",
  "due_date",
  "days_overdue",
  "contact",
]);
export type VerifiedFactKind = z.infer<typeof VerifiedFactKindSchema>;

/** A fact the reminder may state, with the evidence that verifies it. */
export const VerifiedFactSchema = z.object({
  claimId: z.string().min(1),
  kind: VerifiedFactKindSchema,
  value: z.string(),
  evidenceId: z.string().min(1),
});
export type VerifiedFact = z.infer<typeof VerifiedFactSchema>;

/** Where a verified fact sits in the body: `[start, end)` character offsets. */
export const FootnoteSchema = z.object({
  claimId: z.string().min(1),
  span: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
});
export type Footnote = z.infer<typeof FootnoteSchema>;

/** One of the nine pre-approval checks (validate.ts), ids 1-9. */
export const CheckSchema = z.object({
  id: z.number().int().min(1).max(9),
  name: z.string(),
  passed: z.boolean(),
  reason: z.string(),
});
export type Check = z.infer<typeof CheckSchema>;

export const DraftStatusSchema = z.enum([
  "generated",
  "edited",
  "validated",
  "blocked",
  "approved",
  "sent_simulated",
  "rejected",
]);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const DraftSchema = z.object({
  draft_id: z.string().min(1),
  invoice_id: z.string().min(1),
  customer_id: z.string(),
  status: DraftStatusSchema,
  subject: z.string(),
  body: z.string(),
  facts: z.array(VerifiedFactSchema),
  footnotes: z.array(FootnoteSchema),
  /** Outstanding at generation; TASK-16's approve gate reads it (> ₹5L → Manager). */
  amount_paise: z.number().int(),
  /** The invoice rests on an ambiguous payment match (→ Manager approval). */
  ambiguous_match: z.boolean(),
  /** Conflicting payment information is open on the invoice (→ Manager approval). */
  conflicting_payment: z.boolean(),
  checks: z.array(CheckSchema),
  /** Ids of the checks that failed at the last validation. */
  failed_checks: z.array(z.number().int()),
  created_at: isoTimestamp,
  /** Set only by autopilot_send (TASK-41); a human approve-and-send leaves it unset. */
  sent_by: z.literal("copilot").optional(),
});
export type Draft = z.infer<typeof DraftSchema>;

// --- Dispute (Data-Model.md §4, TASK-17) -----------------------------------

export const DisputeStatusSchema = z.enum([
  "new",
  "under_review",
  "awaiting_customer",
  "resolved",
  "rejected",
]);
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

export const DisputeSchema = z.object({
  dispute_id: z.string().min(1),
  /** Absent only for the "duplicate" pairing case, where the claim names a
   * candidate pair rather than one invoice. */
  invoice_id: z.string().optional(),
  customer_id: z.string(),
  type: DisputeTypeSchema,
  /** Absent for a dispute opened manually (`mark_disputed`) with no source email. */
  source_message_id: z.string().optional(),
  claim_text: z.string(),
  ai_recommendation: z.string(),
  assigned_reviewer: z.string().optional(),
  status: DisputeStatusSchema,
});
export type Dispute = z.infer<typeof DisputeSchema>;
