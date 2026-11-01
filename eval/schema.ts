/**
 * Eval label schemas (TKT-06 / TASK-11, AI-Evaluation.md §2).
 *
 * Labels are hand-written ground truth. They are authored from the scenario
 * spec and the raw thread text, never from Verilane's extractor or classifier
 * output. Any change to a label file needs a reason in `eval/CHANGELOG.md`.
 *
 * Money is integer paise. Dates are ISO `YYYY-MM-DD`.
 */
import { z } from "zod";

export const MATCH_OUTCOMES = ["matched", "ambiguous", "customer_only", "unresolved"] as const;
export const EMAIL_CLASSES = [
  "commitment",
  "confirmation",
  "dispute",
  "duplicate",
  "delay",
  "enquiry",
  "unknown",
] as const;
export const DISPUTE_TYPES = [
  "incorrect_amount",
  "incorrect_billing_period",
  "missing_po",
  "not_received",
  "duplicate_invoice",
  "payment_already_completed",
  "unknown",
] as const;

/**
 * Language phenomena a held-out thread exercises (technical-plan 11.3, R20).
 * Tags describe the thread text only; they never change a label value.
 * `lakh_amount` tags the word "lakh" only; an amount written with Indian
 * digit grouping (₹1,16,000) does not count on its own.
 */
export const PHENOMENA = [
  "near_miss_ref",
  "negation",
  "hedging",
  "lakh_amount",
  "relative_date",
  "dd_mm_date",
] as const;

export const MatchOutcome = z.enum(MATCH_OUTCOMES);
export const Phenomenon = z.enum(PHENOMENA);
export const EmailClass = z.enum(EMAIL_CLASSES);
export const DisputeType = z.enum(DISPUTE_TYPES);

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const InvoiceRef = z.string().regex(/^INV-\d+$/, "expected normalised INV-<digits>");
const Paise = z.number().int().nonnegative();

export const ThreadLabel = z
  .object({
    thread_id: z.string().min(1),
    /** Customer the sender is identified as (contacts only; a name mention is not enough). */
    customer_id: z.string().min(1).nullable(),
    /** The single resolved invoice when `matched`; null otherwise. */
    invoice_id: z.string().min(1).nullable(),
    /** Every ledger invoice the thread concerns (or the candidates, when ambiguous). */
    invoice_ids: z.array(z.string().min(1)),
    match_outcome: MatchOutcome,
    email_class: EmailClass,
    dispute_type: DisputeType.optional(),
    /** Every INR amount stated in the thread, in paise, in order of first appearance. */
    amounts: z.array(Paise),
    /** Invoice numbers as cited, normalised to `INV-<digits>`. */
    invoice_refs: z.array(InvoiceRef),
    /** Promised date (commitment) or claimed payment date (confirmation / paid dispute). */
    commitment_date: IsoDate.nullable().optional(),
    /** True when more than one ledger invoice is a plausible target. */
    ambiguous: z.boolean(),
    /** Held-out sets only: the phenomena the thread exercises (may be empty). */
    phenomena: z.array(Phenomenon).optional(),
    /** How the label was derived, for reviewers. */
    note: z.string().optional(),
  })
  .superRefine((l, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: "custom", message: `${l.thread_id}: ${message}` });
    };
    switch (l.match_outcome) {
      case "matched":
        if (l.invoice_id === null) issue("matched needs invoice_id");
        if (l.customer_id === null) issue("matched needs customer_id");
        if (l.ambiguous) issue("matched cannot be ambiguous");
        break;
      case "ambiguous":
        if (l.invoice_id !== null) issue("ambiguous must have invoice_id null");
        if (!l.ambiguous) issue("ambiguous outcome needs ambiguous=true");
        if (l.invoice_ids.length < 1) issue("ambiguous needs at least one candidate");
        break;
      case "customer_only":
        if (l.customer_id === null) issue("customer_only needs customer_id");
        if (l.invoice_id !== null) issue("customer_only must have invoice_id null");
        break;
      case "unresolved":
        if (l.customer_id !== null) issue("unresolved must have customer_id null");
        if (l.invoice_id !== null) issue("unresolved must have invoice_id null");
        if (l.ambiguous) issue("unresolved cannot be ambiguous");
        break;
    }
    const needsType = l.email_class === "dispute" || l.email_class === "duplicate";
    if (needsType && l.dispute_type === undefined) issue("dispute/duplicate needs dispute_type");
    if (!needsType && l.dispute_type !== undefined) issue("dispute_type only on dispute/duplicate");
    if (l.email_class === "duplicate" && l.dispute_type !== "duplicate_invoice") {
      issue("duplicate needs dispute_type duplicate_invoice");
    }
  });
export type ThreadLabel = z.infer<typeof ThreadLabel>;

export const ThreadLabelFile = z.array(ThreadLabel);

/** Kinds of verified fact a draft footnotes (Architecture.md §7). */
export const FactKind = z.enum([
  "invoice_number",
  "customer_name",
  "amount",
  "due_date",
  "days_overdue",
  "contact",
]);

/**
 * An edit applied to the generated draft before approval (FS12).
 * `append` adds free text with no footnote. `replace_fact` overwrites the
 * span of one footnoted fact, so that span loses its validated claim.
 */
export const DraftEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("append"), text: z.string().min(1) }),
  z.object({ op: z.literal("replace_fact"), fact_kind: FactKind, text: z.string().min(1) }),
]);

/** Check numbers follow Architecture.md §7 (1 = invoice exists … 9 = footnote coverage). */
const CheckNo = z.number().int().min(1).max(9);

export const DraftCase = z
  .object({
    case_id: z.string().regex(/^D-\d{3}$/),
    description: z.string().min(1),
    /** Seed ledger `invoice_id` the draft is generated for. */
    invoice_id: z.string().min(1),
    role: z.enum(["analyst", "manager"]),
    edit: DraftEdit.optional(),
    tags: z.array(z.string().min(1)),
    expected: z.object({
      approvable: z.boolean(),
      /** Checks that must fail; empty when the draft is clean. */
      must_fail: z.array(CheckNo),
      requires_manager: z.boolean().optional(),
    }),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: "custom", message: `${d.case_id}: ${message}` });
    };
    const { approvable, must_fail, requires_manager } = d.expected;
    if (approvable && must_fail.length > 0) issue("approvable case cannot list failing checks");
    if (approvable && requires_manager === true && d.role === "analyst") {
      issue("analyst cannot approve a case that requires a manager");
    }
  });
export type DraftCase = z.infer<typeof DraftCase>;

export const DraftCaseFile = z.array(DraftCase);
