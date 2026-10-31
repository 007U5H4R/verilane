/**
 * Single source of truth for the domain's shapes (Data-Model.md §1). Every
 * `type X = z.infer<...>` below is inferred, never hand-declared, so the
 * runtime schema and the compile-time type can't drift apart.
 */
import { z } from "zod";

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
  amount_paise: z.number().int(),
  currency: z.string().nullable(), // null → check 4 fails.
  status_raw: z.string(),
  status: InvoiceStatusSchema, // FS10 (unrecognized status_raw) → "unknown".
  billing_period: z.string().nullable(),
  po_number: z.string().nullable(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const PaymentSchema = z.object({
  payment_id: z.string(),
  invoice_id: z.string(),
  paid_on: isoDate,
  amount_paise: z.number().int(), // partial payments allowed (FS8).
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

export const DataIssueKindSchema = z.enum(["missing", "conflict", "unparseable"]);
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
