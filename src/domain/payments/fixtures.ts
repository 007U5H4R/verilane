/**
 * Seed-shaped fixtures for the payments tests: copied (trimmed) from
 * public/seed and the derived review items the recompute produces for them.
 * Test-only — nothing in the app imports this file.
 */
import { paise } from "../money";
import type { Customer, EmailMessage, Extraction, Invoice, Match, Payment } from "../schema";
import type { StoredException } from "./reconcile";

const inv = (invoice_id: string, invoice_number: string, customer_id: string, amount: number, status: string): Invoice =>
  ({
    row_id: 1,
    invoice_id,
    invoice_number,
    customer_id,
    invoice_date: "2026-08-20",
    due_date: "2026-09-20",
    amount_paise: paise(amount),
    currency: "INR",
    status_raw: status,
    status,
    billing_period: null,
    po_number: null,
  }) as unknown as Invoice;

export const INVOICES: Invoice[] = [
  inv("INV-D", "INV-1016", "C-004", 12_500_000, "open"),
  inv("INV-I", "INV-1017", "C-004", 5_000_000, "paid"),
  inv("INV-034", "INV-1034", "C-004", 20_000_000, "partially_paid"),
  inv("INV-042", "INV-1042", "C-006", 34_000_000, "open"),
  inv("INV-033", "INV-1033", "C-002", 7_250_000, "open"),
  inv("INV-019", "INV-1019", "C-009", 4_800_000, "open"),
  inv("INV-020", "INV-1020", "C-009", 4_800_000, "open"),
  inv("INV-024", "INV-1024", "C-007", 7_600_000, "open"),
  inv("INV-X", "INV-1099", "C-007", 5_000_000, "paid"),
];

export const CUSTOMERS: Customer[] = [
  { customer_id: "C-002", name: "Bharat Polymers Ltd" },
  { customer_id: "C-004", name: "Deccan Logistics LLP" },
  { customer_id: "C-006", name: "Ganga Steel Works Ltd" },
  { customer_id: "C-007", name: "Other Customer Ltd" },
  { customer_id: "C-009", name: "Jaipur Ceramics Co" },
].map((c) => ({ ...c, contact_emails: [], payment_terms_days: 30, segment: "sme" }) as unknown as Customer);

const pay = (payment_id: string, invoice_id: string, paid_on: string, amount: number): Payment => ({
  payment_id,
  invoice_id,
  paid_on,
  amount_paise: paise(amount),
});

export const PAYMENTS: Payment[] = [
  pay("P-001", "INV-X", "2026-10-02", 5_000_000), // C-007: same amount as E-009, other customer
  pay("P-010", "INV-I", "2026-10-01", 5_000_000), // C-004, other invoice, same amount
  pay("P-011", "INV-034", "2026-10-20", 5_000_000), // C-004, exact for E-009
];

const email = (message_id: string, from_address: string, sent_at: string, body: string): EmailMessage => ({
  thread_id: message_id.slice(0, 5),
  message_id,
  from_address,
  sent_at,
  subject: "s",
  body,
});

export const EMAILS: EmailMessage[] = [
  email(
    "E-006-1",
    "accounts@deccanlogistics.test",
    "2026-10-29T08:20:00Z",
    "Hi,\n\nWe paid INV-1016 yesterday via NEFT, ₹1,25,000. Please check and update your records.\n\nThanks,\nAnil Reddy",
  ),
  email(
    "E-007-1",
    "treasury@gangasteel.test",
    "2026-10-28T05:45:00Z",
    "Dear team,\n\nWe have paid ₹3,00,000 against INV-1042 on 27/10/2026. UTR reference GSW2610270042.\n\nRegards,",
  ),
  email(
    "E-008-1",
    "ap@bharatpolymers.test",
    "2026-10-26T10:00:00Z",
    "Hello,\n\nINV-1033 for ₹72,500 was paid on 24 Oct 2026. Kindly confirm receipt.\n\nKavita Shah",
  ),
  email(
    "E-009-1",
    "accounts@deccanlogistics.test",
    "2026-10-21T12:10:00Z",
    "Hi,\n\nWe released ₹50,000 against INV-1034 on 20/10/2026 as a part payment. The balance will follow next month.",
  ),
  email(
    "E-016-1",
    "accounts@jaipurceramics.test",
    "2026-10-14T07:30:00Z",
    "Hello,\n\nINV-1020 looks like a duplicate of INV-1019: same PO, same period, same amount of ₹48,000.",
  ),
];

/** The simulated extraction resolves "yesterday" to a date — the UI must not show it as stated. */
export const EXTRACTIONS: Extraction[] = (
  [
    ["E-006-1", 12_500_000, "2026-10-28"],
    ["E-007-1", 30_000_000, "2026-10-27"],
    ["E-008-1", 7_250_000, "2026-10-24"],
    ["E-009-1", 5_000_000, "2026-10-20"],
  ] as const
).map(
  ([message_id, amount, paid_on]) =>
    ({
      message_id,
      thread_id: message_id.slice(0, 5),
      email_class: "confirmation",
      invoice_refs: [],
      amounts: [amount],
      dates: [paid_on],
      commitment_date: paid_on,
      payment_claim: { paid_on, amount_paise: amount },
      missing_info: [],
      status: "valid",
    }) as unknown as Extraction,
);

export const MATCHES: Match[] = [
  { message_id: "E-006-1", outcome: "matched", customer_id: "C-004", invoice_id: "INV-D", candidates: ["INV-D"], reason: "r" },
  { message_id: "E-007-1", outcome: "matched", customer_id: "C-006", invoice_id: "INV-042", candidates: ["INV-042"], reason: "r" },
  { message_id: "E-008-1", outcome: "matched", customer_id: "C-002", invoice_id: "INV-033", candidates: ["INV-033"], reason: "r" },
  { message_id: "E-009-1", outcome: "matched", customer_id: "C-004", invoice_id: "INV-034", candidates: ["INV-034"], reason: "r" },
  {
    message_id: "E-016-1",
    outcome: "matched",
    customer_id: "C-009",
    invoice_id: "INV-020",
    candidates: ["INV-020", "INV-019"],
    reason: "r",
  },
  { message_id: "E-024-1", outcome: "ambiguous", customer_id: "C-006", candidates: ["INV-024", "INV-042"], reason: "r" },
];

const recon = (
  message_id: string,
  invoice_id: string,
  claim: number | undefined,
  outstanding: number,
  extra: Partial<StoredException> = {},
): StoredException => {
  const r: StoredException = {
    review_id: `RV-${message_id}-reconcile`,
    kind: "reconciliation",
    message_id,
    invoice_id,
    linked_review_ids: [],
    recommendation: "Match the claimed payment against the bank statement before any reminder",
    evidence_ids: [],
    validation_status: "verified",
    escalation_reason: "Email says paid; the ledger shows no matching payment",
    requires_role: "manager",
    status: "open",
    ledger_outstanding_paise: paise(outstanding),
    ...extra,
  };
  if (claim !== undefined) r.email_amount_paise = paise(claim);
  return r;
};

export const REVIEW_ITEMS: StoredException[] = [
  recon("E-006-1", "INV-D", 12_500_000, 12_500_000),
  recon("E-007-1", "INV-042", 30_000_000, 34_000_000, { validation_status: "conflict" }),
  recon("E-008-1", "INV-033", 7_250_000, 7_250_000),
  recon("E-009-1", "INV-034", 5_000_000, 15_000_000, { validation_status: "conflict" }),
  recon("E-016-1", "INV-019", undefined, 4_800_000, {
    review_id: "RV-E-016-1-INV-019",
    linked_review_ids: ["RV-E-016-1-INV-020"],
  }),
  recon("E-016-1", "INV-020", undefined, 4_800_000, {
    review_id: "RV-E-016-1-INV-020",
    linked_review_ids: ["RV-E-016-1-INV-019"],
  }),
  {
    review_id: "RV-E-024-1-match",
    kind: "uncertain_match",
    message_id: "E-024-1",
    linked_review_ids: [],
    recommendation: "Confirm which invoice this email is about",
    evidence_ids: [],
    validation_status: "conflict",
    escalation_reason: "INV-1024 belongs to another customer; possible transposition of INV-1042",
    requires_role: "analyst",
    status: "open",
  },
];

export const byId = <T, K extends keyof T>(rows: T[], key: K): Map<string, T> =>
  new Map(rows.map((r) => [String(r[key]), r]));
