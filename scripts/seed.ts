#!/usr/bin/env tsx
/**
 * TASK-8 (TKT-03): generates the full synthetic demo seed into `public/seed/`
 * — 50 invoices, 10 customers, payments, 25 email threads — as of
 * 2026-10-30. Run with `pnpm seed`. The output is committed; the shipped
 * data never depends on re-running this script (Data-Model.md §7), and
 * `scripts/seed.test.ts` proves a re-run is byte-identical (TC-012).
 *
 * Everything is fictional (T5): company names are invented and every
 * address uses the reserved `.test` TLD. Filler values (paid-history
 * lateness, filler amounts and due dates) come from `mulberry32(20261030)`;
 * every scenario value below is spelled out so the coverage test (TC-011)
 * and TASK-11's eval labels can rely on it.
 *
 * Scenario spec (invoice_number = `INV-` + (1000 + row_id); ledger
 * invoice_id = `INV-0NN`, except the worked examples A–E and the tracer's
 * legacy F–J, which keep their letter ids):
 *
 * | Scenario                         | Invoices (invoice_number)                    | Threads            |
 * |----------------------------------|----------------------------------------------|--------------------|
 * | Worked example A (broken promise)| INV-A (INV-1012)                             | E-001              |
 * | Worked example B (low, no email) | INV-B (INV-1013)                             | —                  |
 * | Worked example C (dispute, G4)   | INV-C (INV-1015)                             | E-011              |
 * | Worked example D (paid claim, G5)| INV-D (INV-1016)                             | E-006              |
 * | Worked example E (no due, G3)    | INV-E (INV-1014)                             | —                  |
 * | Commitment (≥5)                  | 1012, 1029, 1030, 1031, 1032 (+1024/1042)    | E-001..E-005, E-024|
 * | Confirmation (≥5)                | 1016, 1042, 1033, 1034, 1035                 | E-006..E-010       |
 * | Dispute (≥5)                     | 1015, 1036, 1037, 1038, 1039                 | E-011..E-015       |
 * | Duplicate (≥5, FS6)              | pairs 1019/1020, 1021/1022, 1023/1024,       | E-016..E-020       |
 * |                                  | 1025/1026, 1027/1028                         |                    |
 * | Missing data (≥5)                | INV-F (no number), 1044 (no number),         | —                  |
 * |                                  | INV-E, 1045, 1046 (no due date)              |                    |
 * | Delay / enquiry / missing info   | 1040 / 1041 / 1043                           | E-021 / E-022 / E-023 |
 * | Unknown class (customer only)    | none named                                   | E-025              |
 * | FS1 missing invoice number       | INV-F, row 44                                | —                  |
 * | FS2 missing due date             | INV-E, 1045, 1046                            | —                  |
 * | FS3 similar numbers (transposed) | 1042 (sender's) vs 1024 (cited, other cust.) | E-024              |
 * | FS4 multiple open, none named    | C-008's 1027, 1028, 1045, 1047, row 44       | E-025              |
 * | FS5 conflicting payment amount   | 1042: email ₹3,00,000 vs ledger ₹3,40,000    | E-007              |
 * | FS6 duplicate-invoice claim      | the five duplicate pairs                     | E-016..E-020       |
 * | FS7 payment claimed, ledger open | INV-D, 1033, 1035                            | E-006, E-008, E-010|
 * | FS8 partial payment              | INV-G (supplied outstanding conflicts), 1034 | E-009 (1034)       |
 * | FS9 no related email             | e.g. INV-B, INV-J, 1047..1050                | —                  |
 * | FS10 unknown status              | INV-H (status_raw `pending_review`)          | —                  |
 * | Paid history / closed            | rows 1–8, INV-I (paid), 1050 (written off)   | —                  |
 * | Unapplied bank line (TKT-75.02)  | P-012 (no invoice) = INV-F's ₹25,000 only    | —                  |
 * | FS14 fits two invoices equally   | P-013 ₹48,000 = 1019 and 1020 (C-009 pair)   | —                  |
 * | FS15 exceeds open balance        | P-014 ₹3,10,000 from C-004 (open ₹2,90,000)  | —                  |
 * | FS16 mistyped reference          | P-015 cites "INV-1O37" (letter O), ₹88,000   | —                  |
 * | FS17 untraceable cash            | P-016 ₹61,500, no payer, no reference        | —                  |
 * | Not yet due (G6)                 | 1047, 1048, 1049                             | —                  |
 *
 * Paid history sets each customer's average days late (Architecture.md §5):
 * C-001 (A's customer) averages 12 days late, C-002 (B's) averages 2.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SEED_VERSION = "2026-11-07.1";
export const SEED_AS_OF = "2026-10-30";
const PRNG_SEED = 20261030;

// --- Spec types --------------------------------------------------------------

/** The seven email classes (Discovery-PRD F5). */
export type EmailClass =
  | "commitment"
  | "confirmation"
  | "dispute"
  | "duplicate"
  | "delay"
  | "enquiry"
  | "unknown";

export type DisputeType =
  | "duplicate_invoice"
  | "incorrect_amount"
  | "incorrect_billing_period"
  | "missing_po"
  | "not_received"
  | "payment_already_completed"
  | "unknown";

export type MatchOutcome = "matched" | "ambiguous" | "customer_only" | "unresolved";

export type EdgeCase =
  | "FS1"
  | "FS2"
  | "FS3"
  | "FS4"
  | "FS5"
  | "FS6"
  | "FS7"
  | "FS8"
  | "FS9"
  | "FS10"
  // TKT-75.08: unapplied bank lines the allocation recommender must not guess on.
  | "FS14"
  | "FS15"
  | "FS16"
  | "FS17";

export interface CustomerSpec {
  customer_id: string;
  name: string;
  contact_emails: string[];
  payment_terms_days: number;
  segment: string;
}

export interface InvoiceSpec {
  row_id: number;
  /** Ledger id; defaults to `INV-0NN` from the row. */
  invoice_id?: string;
  customer_id: string;
  /** What this invoice is in the seed, for humans and the coverage test. */
  scenario: string;
  edge_cases?: EdgeCase[];
  /** Days past due as of SEED_AS_OF (negative = not yet due); `null` = due date
   * missing (FS2); `"rand"` = filler from the PRNG. */
  days_overdue: number | null | "rand-overdue" | "rand-not-due";
  /** Gross amount in whole rupees; omitted = filler from the PRNG. */
  amount_rupees?: number;
  status_raw?: string;
  /** FS1: leave invoice_number blank. */
  number_missing?: true;
  /** Paid in full this many days after the due date (`"rand"` = PRNG 0–30). */
  paid_late_days?: number | "rand";
  partial_payment?: { rupees: number; paid_on: string };
  /** FS8: a supplied outstanding_amount that disagrees with amount − Σpayments. */
  supplied_outstanding_rupees?: number;
  po_missing?: true;
  /** FS6: a re-issue of `duplicate_of`'s row — same amount, PO and billing period. */
  duplicate_of?: number;
}

export interface ThreadSpec {
  thread_id: string;
  customer_id: string;
  from_address: string;
  sent_at: string;
  subject: string;
  body: string;
  /** Labels (TASK-11 writes eval/seed.labels.json from these). */
  email_class: EmailClass;
  dispute_type: DisputeType | null;
  /** Invoice references exactly as written in the email. */
  invoice_refs: string[];
  amounts_rupees: number[];
  /** The promised/claimed payment date, resolved against `sent_at`. */
  commitment_date: string | null;
  match: MatchOutcome;
  /** Information the customer says it needs before it can pay. */
  missing_info?: string[];
  /** Ledger invoice_id(s) the thread is about (candidates when ambiguous). */
  invoice_ids: string[];
  edge_cases: EdgeCase[];
}

// --- Customers -----------------------------------------------------------------

export const CUSTOMERS: CustomerSpec[] = [
  {
    customer_id: "C-001",
    name: "Aravalli Textiles Pvt Ltd",
    contact_emails: ["accounts@aravalli-textiles.test", "payables@aravalli-textiles.test"],
    payment_terms_days: 30,
    segment: "Mid-Market",
  },
  {
    customer_id: "C-002",
    name: "Bharat Polymers Ltd",
    contact_emails: ["ap@bharatpolymers.test"],
    payment_terms_days: 30,
    segment: "SMB",
  },
  {
    customer_id: "C-003",
    name: "Coromandel Foods Pvt Ltd",
    contact_emails: ["finance@coromandelfoods.test"],
    payment_terms_days: 45,
    segment: "Enterprise",
  },
  {
    customer_id: "C-004",
    name: "Deccan Logistics LLP",
    contact_emails: ["accounts@deccanlogistics.test"],
    payment_terms_days: 30,
    segment: "Mid-Market",
  },
  {
    customer_id: "C-005",
    name: "Everest Pharma Distributors",
    contact_emails: ["payables@everestpharma.test"],
    payment_terms_days: 30,
    segment: "SMB",
  },
  {
    customer_id: "C-006",
    name: "Ganga Steel Works Ltd",
    contact_emails: ["ap@gangasteel.test", "treasury@gangasteel.test"],
    payment_terms_days: 45,
    segment: "Enterprise",
  },
  {
    customer_id: "C-007",
    name: "Himalaya Electricals",
    contact_emails: ["accounts@himalayaelectricals.test"],
    payment_terms_days: 30,
    segment: "SMB",
  },
  {
    customer_id: "C-008",
    name: "Indus Software Services Pvt Ltd",
    contact_emails: ["finance@indussoftware.test"],
    payment_terms_days: 15,
    segment: "Mid-Market",
  },
  {
    customer_id: "C-009",
    name: "Jaipur Ceramics Co",
    contact_emails: ["accounts@jaipurceramics.test"],
    payment_terms_days: 30,
    segment: "SMB",
  },
  {
    customer_id: "C-010",
    name: "Konkan Agro Exports Ltd",
    contact_emails: ["payables@konkanagro.test"],
    payment_terms_days: 60,
    segment: "Enterprise",
  },
];

// --- Invoices ------------------------------------------------------------------

export const INVOICES: InvoiceSpec[] = [
  // Paid history: C-001 late 10/12/14 (avg 12), C-002 late 1/3 (avg 2).
  { row_id: 1, customer_id: "C-001", scenario: "paid history", days_overdue: 120, paid_late_days: 10, status_raw: "paid" },
  { row_id: 2, customer_id: "C-001", scenario: "paid history", days_overdue: 95, paid_late_days: 12, status_raw: "paid" },
  { row_id: 3, customer_id: "C-001", scenario: "paid history", days_overdue: 70, paid_late_days: 14, status_raw: "paid" },
  { row_id: 4, customer_id: "C-002", scenario: "paid history", days_overdue: 100, paid_late_days: 1, status_raw: "paid" },
  { row_id: 5, customer_id: "C-002", scenario: "paid history", days_overdue: 75, paid_late_days: 3, status_raw: "paid" },
  { row_id: 6, customer_id: "C-003", scenario: "paid history", days_overdue: 110, paid_late_days: "rand", status_raw: "paid" },
  { row_id: 7, customer_id: "C-006", scenario: "paid history", days_overdue: 90, paid_late_days: "rand", status_raw: "paid" },
  { row_id: 8, customer_id: "C-009", scenario: "paid history", days_overdue: 80, paid_late_days: "rand", status_raw: "paid" },
  // Tracer-era cases kept by id (TASK-7.7).
  { row_id: 9, invoice_id: "INV-F", customer_id: "C-005", scenario: "missing invoice number", edge_cases: ["FS1"], days_overdue: 5, amount_rupees: 25_000, number_missing: true },
  { row_id: 10, invoice_id: "INV-G", customer_id: "C-003", scenario: "partial payment, conflicting supplied outstanding", edge_cases: ["FS8"], days_overdue: 30, amount_rupees: 1_00_000, partial_payment: { rupees: 30_000, paid_on: "2026-10-15" }, supplied_outstanding_rupees: 80_000 },
  { row_id: 11, invoice_id: "INV-H", customer_id: "C-003", scenario: "unknown status", edge_cases: ["FS10"], days_overdue: 25, amount_rupees: 18_000, status_raw: "pending_review" },
  // Worked examples (Solution-PRD / Architecture.md §5.4); rows 12–14 match
  // src/domain/__fixtures__/worked-examples.ts.
  { row_id: 12, invoice_id: "INV-A", customer_id: "C-001", scenario: "worked example A: broken promise", days_overdue: 47, amount_rupees: 3_40_000 },
  { row_id: 13, invoice_id: "INV-B", customer_id: "C-002", scenario: "worked example B: low, prompt payer", edge_cases: ["FS9"], days_overdue: 10, amount_rupees: 40_000 },
  { row_id: 14, invoice_id: "INV-E", customer_id: "C-005", scenario: "worked example E: due date missing", edge_cases: ["FS2"], days_overdue: null, amount_rupees: 10_000 },
  { row_id: 15, invoice_id: "INV-C", customer_id: "C-003", scenario: "worked example C: incorrect-amount dispute", days_overdue: 90, amount_rupees: 6_00_000 },
  { row_id: 16, invoice_id: "INV-D", customer_id: "C-004", scenario: "worked example D: paid-yesterday claim, ledger unpaid", edge_cases: ["FS7"], days_overdue: 20, amount_rupees: 1_25_000 },
  { row_id: 17, invoice_id: "INV-I", customer_id: "C-004", scenario: "paid history", days_overdue: 40, amount_rupees: 50_000, paid_late_days: 11, status_raw: "paid" },
  { row_id: 18, invoice_id: "INV-J", customer_id: "C-004", scenario: "open, no email", edge_cases: ["FS9"], days_overdue: 20, amount_rupees: 15_000 },
  // Duplicate pairs (FS6): the second row re-issues the first.
  { row_id: 19, customer_id: "C-009", scenario: "duplicate pair (original)", edge_cases: ["FS6"], days_overdue: "rand-overdue", amount_rupees: 48_000 },
  { row_id: 20, customer_id: "C-009", scenario: "duplicate pair (re-issue)", edge_cases: ["FS6"], days_overdue: "rand-overdue", duplicate_of: 19 },
  { row_id: 21, customer_id: "C-009", scenario: "duplicate pair (original)", edge_cases: ["FS6"], days_overdue: "rand-overdue", amount_rupees: 1_32_500 },
  { row_id: 22, customer_id: "C-009", scenario: "duplicate pair (re-issue)", edge_cases: ["FS6"], days_overdue: "rand-overdue", duplicate_of: 21 },
  { row_id: 23, customer_id: "C-007", scenario: "duplicate pair (original)", edge_cases: ["FS6"], days_overdue: "rand-overdue", amount_rupees: 76_000 },
  { row_id: 24, customer_id: "C-007", scenario: "duplicate pair (re-issue); cited by C-006 in FS3", edge_cases: ["FS6", "FS3"], days_overdue: "rand-overdue", duplicate_of: 23 },
  { row_id: 25, customer_id: "C-010", scenario: "duplicate pair (original)", edge_cases: ["FS6"], days_overdue: "rand-overdue", amount_rupees: 2_25_000 },
  { row_id: 26, customer_id: "C-010", scenario: "duplicate pair (re-issue)", edge_cases: ["FS6"], days_overdue: "rand-overdue", duplicate_of: 25 },
  { row_id: 27, customer_id: "C-008", scenario: "duplicate pair (original)", edge_cases: ["FS6", "FS4"], days_overdue: "rand-overdue", amount_rupees: 59_000 },
  { row_id: 28, customer_id: "C-008", scenario: "duplicate pair (re-issue)", edge_cases: ["FS6", "FS4"], days_overdue: "rand-overdue", duplicate_of: 27 },
  // Commitments.
  { row_id: 29, customer_id: "C-010", scenario: "active commitment", days_overdue: 25, amount_rupees: 2_10_000 },
  { row_id: 30, customer_id: "C-010", scenario: "active commitment (ISO date)", days_overdue: 40, amount_rupees: 1_80_000 },
  { row_id: 31, customer_id: "C-006", scenario: "active commitment (relative date)", days_overdue: 18, amount_rupees: 95_000 },
  { row_id: 32, customer_id: "C-007", scenario: "active commitment (DD/MM/YYYY date)", days_overdue: 33, amount_rupees: 1_40_000 },
  // Confirmations.
  { row_id: 33, customer_id: "C-002", scenario: "payment claimed, ledger unpaid", edge_cases: ["FS7"], days_overdue: 22, amount_rupees: 72_500 },
  { row_id: 34, customer_id: "C-004", scenario: "partial payment, confirmed by email", edge_cases: ["FS8"], days_overdue: 35, amount_rupees: 2_00_000, status_raw: "partially_paid", partial_payment: { rupees: 50_000, paid_on: "2026-10-20" } },
  { row_id: 35, customer_id: "C-010", scenario: "payment claimed today (relative), ledger unpaid", edge_cases: ["FS7"], days_overdue: 12, amount_rupees: 1_10_000 },
  // Disputes.
  { row_id: 36, customer_id: "C-003", scenario: "incorrect-billing-period dispute", days_overdue: 28, amount_rupees: 2_45_000 },
  { row_id: 37, customer_id: "C-007", scenario: "missing-PO dispute", days_overdue: 21, amount_rupees: 88_000, po_missing: true },
  { row_id: 38, customer_id: "C-009", scenario: "not-received dispute", days_overdue: 16, amount_rupees: 64_000 },
  { row_id: 39, customer_id: "C-002", scenario: "already-paid dispute", days_overdue: 45, amount_rupees: 1_15_000 },
  // Other email classes.
  { row_id: 40, customer_id: "C-006", scenario: "delay, no date", days_overdue: 38, amount_rupees: 2_60_000 },
  { row_id: 41, customer_id: "C-005", scenario: "enquiry", days_overdue: 8, amount_rupees: 32_000 },
  { row_id: 42, customer_id: "C-006", scenario: "conflicting payment amount; transposition source", edge_cases: ["FS5", "FS3"], days_overdue: 30, amount_rupees: 3_40_000 },
  { row_id: 43, customer_id: "C-007", scenario: "missing-info reply", days_overdue: 14, amount_rupees: 54_000 },
  // Extra missing data.
  { row_id: 44, customer_id: "C-008", scenario: "missing invoice number", edge_cases: ["FS1", "FS4"], days_overdue: "rand-overdue", number_missing: true },
  { row_id: 45, customer_id: "C-008", scenario: "due date missing", edge_cases: ["FS2", "FS4"], days_overdue: null },
  { row_id: 46, customer_id: "C-010", scenario: "due date missing", edge_cases: ["FS2"], days_overdue: null },
  // Not yet due (G6) and closed.
  { row_id: 47, customer_id: "C-008", scenario: "not yet due", edge_cases: ["FS4", "FS9"], days_overdue: "rand-not-due" },
  { row_id: 48, customer_id: "C-001", scenario: "not yet due", edge_cases: ["FS9"], days_overdue: "rand-not-due" },
  { row_id: 49, customer_id: "C-009", scenario: "not yet due", edge_cases: ["FS9"], days_overdue: "rand-not-due" },
  { row_id: 50, customer_id: "C-006", scenario: "written off", edge_cases: ["FS9"], days_overdue: "rand-overdue", status_raw: "written_off" },
];

// --- Email threads ---------------------------------------------------------------

export const THREADS: ThreadSpec[] = [
  // Commitments.
  {
    thread_id: "E-001",
    customer_id: "C-001",
    from_address: "accounts@aravalli-textiles.test",
    sent_at: "2026-10-08T10:15:00Z",
    subject: "Re: Payment reminder INV-1012",
    body: "Hello,\n\nApologies for the delay on INV-1012. We will release ₹3,40,000 by 20 Oct 2026 once our quarterly budget is approved.\n\nRegards,\nMeera Iyer\nAccounts, Aravalli Textiles",
    email_class: "commitment",
    dispute_type: null,
    invoice_refs: ["INV-1012"],
    amounts_rupees: [3_40_000],
    commitment_date: "2026-10-20",
    match: "matched",
    invoice_ids: ["INV-A"],
    edge_cases: [],
  },
  {
    thread_id: "E-002",
    customer_id: "C-010",
    from_address: "payables@konkanagro.test",
    sent_at: "2026-10-27T06:40:00Z",
    subject: "INV-1029 payment schedule",
    body: "Dear team,\n\nWe have scheduled payment of ₹2,10,000 for INV-1029 and will clear it by 6 November 2026.\n\nThanks,\nRohan Desai\nKonkan Agro Exports",
    email_class: "commitment",
    dispute_type: null,
    invoice_refs: ["INV-1029"],
    amounts_rupees: [2_10_000],
    commitment_date: "2026-11-06",
    match: "matched",
    invoice_ids: ["INV-029"],
    edge_cases: [],
  },
  {
    thread_id: "E-003",
    customer_id: "C-010",
    from_address: "payables@konkanagro.test",
    sent_at: "2026-10-21T09:05:00Z",
    subject: "Re: Overdue INV-1030",
    body: "Hi,\n\nINV-1030 is approved in our system. Payment date is 2026-11-12 as per our next payment run.\n\nRohan Desai\nKonkan Agro Exports",
    email_class: "commitment",
    dispute_type: null,
    invoice_refs: ["INV-1030"],
    amounts_rupees: [],
    commitment_date: "2026-11-12",
    match: "matched",
    invoice_ids: ["INV-030"],
    edge_cases: [],
  },
  {
    thread_id: "E-004",
    customer_id: "C-006",
    from_address: "ap@gangasteel.test",
    sent_at: "2026-10-29T11:30:00Z",
    subject: "INV-1031",
    body: "Hello,\n\nWe will pay INV-1031 (₹95,000) next Monday.\n\nBest,\nSanjay Kulkarni\nGanga Steel Works",
    email_class: "commitment",
    dispute_type: null,
    invoice_refs: ["INV-1031"],
    amounts_rupees: [95_000],
    commitment_date: "2026-11-02",
    match: "matched",
    invoice_ids: ["INV-031"],
    edge_cases: [],
  },
  {
    thread_id: "E-005",
    customer_id: "C-007",
    from_address: "accounts@himalayaelectricals.test",
    sent_at: "2026-10-22T07:50:00Z",
    subject: "Re: Reminder - INV-1032",
    body: "Dear Sir/Madam,\n\nPayment of ₹1,40,000 against INV-1032 will be made on or before 15/11/2026.\n\nRegards,\nPriya Negi\nHimalaya Electricals",
    email_class: "commitment",
    dispute_type: null,
    invoice_refs: ["INV-1032"],
    amounts_rupees: [1_40_000],
    commitment_date: "2026-11-15",
    match: "matched",
    invoice_ids: ["INV-032"],
    edge_cases: [],
  },
  // Confirmations.
  {
    thread_id: "E-006",
    customer_id: "C-004",
    from_address: "accounts@deccanlogistics.test",
    sent_at: "2026-10-29T08:20:00Z",
    subject: "Re: INV-1016 overdue",
    body: "Hi,\n\nWe paid INV-1016 yesterday via NEFT, ₹1,25,000. Please check and update your records.\n\nThanks,\nAnil Reddy\nDeccan Logistics",
    email_class: "confirmation",
    dispute_type: null,
    invoice_refs: ["INV-1016"],
    amounts_rupees: [1_25_000],
    commitment_date: "2026-10-28",
    match: "matched",
    invoice_ids: ["INV-D"],
    edge_cases: ["FS7"],
  },
  {
    thread_id: "E-007",
    customer_id: "C-006",
    from_address: "treasury@gangasteel.test",
    sent_at: "2026-10-28T05:45:00Z",
    subject: "Payment advice INV-1042",
    body: "Dear team,\n\nWe have paid ₹3,00,000 against INV-1042 on 27/10/2026. UTR reference GSW2610270042.\n\nRegards,\nTreasury, Ganga Steel Works",
    email_class: "confirmation",
    dispute_type: null,
    invoice_refs: ["INV-1042"],
    amounts_rupees: [3_00_000],
    commitment_date: "2026-10-27",
    match: "matched",
    invoice_ids: ["INV-042"],
    edge_cases: ["FS5", "FS7"],
  },
  {
    thread_id: "E-008",
    customer_id: "C-002",
    from_address: "ap@bharatpolymers.test",
    sent_at: "2026-10-26T10:00:00Z",
    subject: "Re: INV-1033",
    body: "Hello,\n\nINV-1033 for ₹72,500 was paid on 24 Oct 2026. Kindly confirm receipt.\n\nKavita Shah\nBharat Polymers",
    email_class: "confirmation",
    dispute_type: null,
    invoice_refs: ["INV-1033"],
    amounts_rupees: [72_500],
    commitment_date: "2026-10-24",
    match: "matched",
    invoice_ids: ["INV-033"],
    edge_cases: ["FS7"],
  },
  {
    thread_id: "E-009",
    customer_id: "C-004",
    from_address: "accounts@deccanlogistics.test",
    sent_at: "2026-10-21T12:10:00Z",
    subject: "Part payment INV-1034",
    body: "Hi,\n\nWe released ₹50,000 against INV-1034 on 20/10/2026 as a part payment. The balance will follow next month.\n\nAnil Reddy\nDeccan Logistics",
    email_class: "confirmation",
    dispute_type: null,
    invoice_refs: ["INV-1034"],
    amounts_rupees: [50_000],
    commitment_date: "2026-10-20",
    match: "matched",
    invoice_ids: ["INV-034"],
    edge_cases: ["FS8"],
  },
  {
    thread_id: "E-010",
    customer_id: "C-010",
    from_address: "payables@konkanagro.test",
    sent_at: "2026-10-26T13:25:00Z",
    subject: "INV-1035 processed",
    body: "Dear team,\n\nPayment for INV-1035 (₹1,10,000) has been processed today.\n\nRohan Desai\nKonkan Agro Exports",
    email_class: "confirmation",
    dispute_type: null,
    invoice_refs: ["INV-1035"],
    amounts_rupees: [1_10_000],
    commitment_date: "2026-10-26",
    match: "matched",
    invoice_ids: ["INV-035"],
    edge_cases: ["FS7"],
  },
  // Disputes.
  {
    thread_id: "E-011",
    customer_id: "C-003",
    from_address: "finance@coromandelfoods.test",
    sent_at: "2026-10-12T09:35:00Z",
    subject: "Dispute: INV-1015 amount",
    body: "Hello,\n\nINV-1015 is billed at ₹6,00,000, but the agreed rate card puts this order at ₹5,40,000. The amount is incorrect; please send a revised invoice. We will not process payment until then.\n\nLakshmi Narayanan\nCoromandel Foods",
    email_class: "dispute",
    dispute_type: "incorrect_amount",
    invoice_refs: ["INV-1015"],
    amounts_rupees: [6_00_000, 5_40_000],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-C"],
    edge_cases: [],
  },
  {
    thread_id: "E-012",
    customer_id: "C-003",
    from_address: "finance@coromandelfoods.test",
    sent_at: "2026-10-19T11:00:00Z",
    subject: "INV-1036 billing period",
    body: "Hi,\n\nINV-1036 is raised for August 2026, but the services under this work order were delivered in September 2026. Please correct the billing period and reissue.\n\nLakshmi Narayanan\nCoromandel Foods",
    email_class: "dispute",
    dispute_type: "incorrect_billing_period",
    invoice_refs: ["INV-1036"],
    amounts_rupees: [],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-036"],
    edge_cases: [],
  },
  {
    thread_id: "E-013",
    customer_id: "C-007",
    from_address: "accounts@himalayaelectricals.test",
    sent_at: "2026-10-16T06:55:00Z",
    subject: "INV-1037 - PO required",
    body: "Dear team,\n\nINV-1037 does not quote our purchase order number. Our system cannot book an invoice without a PO, so please reissue it with the PO reference.\n\nPriya Negi\nHimalaya Electricals",
    email_class: "dispute",
    dispute_type: "missing_po",
    invoice_refs: ["INV-1037"],
    amounts_rupees: [],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-037"],
    edge_cases: [],
  },
  {
    thread_id: "E-014",
    customer_id: "C-009",
    from_address: "accounts@jaipurceramics.test",
    sent_at: "2026-10-23T10:40:00Z",
    subject: "Re: INV-1038 reminder",
    body: "Hello,\n\nThe consignment billed on INV-1038 (₹64,000) never reached our warehouse. We have not received the goods, so this invoice is not payable yet.\n\nVikram Singh\nJaipur Ceramics",
    email_class: "dispute",
    dispute_type: "not_received",
    invoice_refs: ["INV-1038"],
    amounts_rupees: [64_000],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-038"],
    edge_cases: [],
  },
  {
    thread_id: "E-015",
    customer_id: "C-002",
    from_address: "ap@bharatpolymers.test",
    sent_at: "2026-10-20T08:15:00Z",
    subject: "INV-1039 already settled",
    body: "Hi,\n\nPlease stop the reminders for INV-1039. We already settled it on 12 Sep 2026 via RTGS. Kindly check your receipts.\n\nKavita Shah\nBharat Polymers",
    email_class: "dispute",
    dispute_type: "payment_already_completed",
    invoice_refs: ["INV-1039"],
    amounts_rupees: [],
    commitment_date: "2026-09-12",
    match: "matched",
    invoice_ids: ["INV-039"],
    edge_cases: ["FS7"],
  },
  // Duplicates (FS6).
  {
    thread_id: "E-016",
    customer_id: "C-009",
    from_address: "accounts@jaipurceramics.test",
    sent_at: "2026-10-14T07:30:00Z",
    subject: "Duplicate invoice INV-1020",
    body: "Hello,\n\nINV-1020 looks like a duplicate of INV-1019: same PO, same period, same amount of ₹48,000. Please cancel INV-1020.\n\nVikram Singh\nJaipur Ceramics",
    email_class: "duplicate",
    dispute_type: "duplicate_invoice",
    invoice_refs: ["INV-1020", "INV-1019"],
    amounts_rupees: [48_000],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-020", "INV-019"],
    edge_cases: ["FS6"],
  },
  {
    thread_id: "E-017",
    customer_id: "C-009",
    from_address: "accounts@jaipurceramics.test",
    sent_at: "2026-10-17T09:10:00Z",
    subject: "Billed twice - INV-1021 / INV-1022",
    body: "Hi,\n\nWe have been billed twice for the same order: INV-1021 and INV-1022, both ₹1,32,500. We will pay one of them once the duplicate is withdrawn.\n\nVikram Singh\nJaipur Ceramics",
    email_class: "duplicate",
    dispute_type: "duplicate_invoice",
    invoice_refs: ["INV-1021", "INV-1022"],
    amounts_rupees: [1_32_500],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-021", "INV-022"],
    edge_cases: ["FS6"],
  },
  {
    thread_id: "E-018",
    customer_id: "C-007",
    from_address: "accounts@himalayaelectricals.test",
    sent_at: "2026-10-18T05:20:00Z",
    subject: "INV-1024 duplicate?",
    body: "Dear team,\n\nINV-1024 repeats INV-1023 for ₹76,000 against the same PO. Please confirm which one stands and issue a credit note for the other.\n\nPriya Negi\nHimalaya Electricals",
    email_class: "duplicate",
    dispute_type: "duplicate_invoice",
    invoice_refs: ["INV-1024", "INV-1023"],
    amounts_rupees: [76_000],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-024", "INV-023"],
    edge_cases: ["FS6"],
  },
  {
    thread_id: "E-019",
    customer_id: "C-010",
    from_address: "payables@konkanagro.test",
    sent_at: "2026-10-24T10:05:00Z",
    subject: "Duplicate billing INV-1026",
    body: "Hello,\n\nINV-1026 duplicates INV-1025 (₹2,25,000, same billing period). We have paid neither while this is open; please withdraw the duplicate.\n\nRohan Desai\nKonkan Agro Exports",
    email_class: "duplicate",
    dispute_type: "duplicate_invoice",
    invoice_refs: ["INV-1026", "INV-1025"],
    amounts_rupees: [2_25_000],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-026", "INV-025"],
    edge_cases: ["FS6"],
  },
  {
    thread_id: "E-020",
    customer_id: "C-008",
    from_address: "finance@indussoftware.test",
    sent_at: "2026-10-25T12:45:00Z",
    subject: "INV-1027 and INV-1028 are the same",
    body: "Hi,\n\nINV-1027 and INV-1028 are for the same licence renewal, ₹59,000 each. This looks like a duplicate invoice. Please cancel one.\n\nArjun Mehta\nIndus Software Services",
    email_class: "duplicate",
    dispute_type: "duplicate_invoice",
    invoice_refs: ["INV-1027", "INV-1028"],
    amounts_rupees: [59_000],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-027", "INV-028"],
    edge_cases: ["FS6"],
  },
  // Delay, enquiry, missing info.
  {
    thread_id: "E-021",
    customer_id: "C-006",
    from_address: "ap@gangasteel.test",
    sent_at: "2026-10-15T09:00:00Z",
    subject: "Re: INV-1040",
    body: "Hello,\n\nCash flow is tight this month and INV-1040 will be delayed. We need a few more weeks and will revert with a date.\n\nSanjay Kulkarni\nGanga Steel Works",
    email_class: "delay",
    dispute_type: null,
    invoice_refs: ["INV-1040"],
    amounts_rupees: [],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-040"],
    edge_cases: [],
  },
  {
    thread_id: "E-022",
    customer_id: "C-005",
    from_address: "payables@everestpharma.test",
    sent_at: "2026-10-27T07:15:00Z",
    subject: "Copy of INV-1041",
    body: "Hi,\n\nCould you send a copy of INV-1041 and confirm your bank details? We want to set up the payment.\n\nNeha Joshi\nEverest Pharma Distributors",
    email_class: "enquiry",
    dispute_type: null,
    invoice_refs: ["INV-1041"],
    amounts_rupees: [],
    commitment_date: null,
    match: "matched",
    invoice_ids: ["INV-041"],
    edge_cases: [],
  },
  {
    thread_id: "E-023",
    customer_id: "C-007",
    from_address: "accounts@himalayaelectricals.test",
    sent_at: "2026-10-28T08:30:00Z",
    subject: "INV-1043 - details needed",
    body: "Dear team,\n\nWe cannot process INV-1043 until you share your GSTIN and the delivery challan number. Please send both.\n\nPriya Negi\nHimalaya Electricals",
    email_class: "enquiry",
    dispute_type: null,
    invoice_refs: ["INV-1043"],
    amounts_rupees: [],
    commitment_date: null,
    match: "matched",
    missing_info: ["GSTIN", "delivery challan number"],
    invoice_ids: ["INV-043"],
    edge_cases: [],
  },
  // FS3: Ganga Steel (owner of INV-1042, ₹3,40,000 outstanding) cites
  // INV-1024, which is Himalaya Electricals' — a likely transposition.
  {
    thread_id: "E-024",
    customer_id: "C-006",
    from_address: "ap@gangasteel.test",
    sent_at: "2026-10-15T10:20:00Z",
    subject: "Payment plan INV-1024",
    body: "Hello,\n\nRegarding INV-1024, we will pay ₹3,40,000 by 10 Nov 2026.\n\nSanjay Kulkarni\nGanga Steel Works",
    email_class: "commitment",
    dispute_type: null,
    invoice_refs: ["INV-1024"],
    amounts_rupees: [3_40_000],
    commitment_date: "2026-11-10",
    match: "ambiguous",
    invoice_ids: ["INV-042", "INV-024"],
    edge_cases: ["FS3"],
  },
  // FS4: Indus Software has several open invoices; the email names none
  // and fits no class (`unknown`).
  {
    thread_id: "E-025",
    customer_id: "C-008",
    from_address: "finance@indussoftware.test",
    sent_at: "2026-10-29T06:05:00Z",
    subject: "Following up",
    body: "Hi,\n\nFollowing up on our call last week about the pending items. Our finance head will look at this when she is back and get in touch.\n\nArjun Mehta\nIndus Software Services",
    email_class: "unknown",
    dispute_type: null,
    invoice_refs: [],
    amounts_rupees: [],
    commitment_date: null,
    match: "customer_only",
    invoice_ids: [],
    edge_cases: ["FS4"],
  },
];

// --- Generator -----------------------------------------------------------------

/** mulberry32: a tiny, well-known 32-bit PRNG — same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function invoiceIdOf(spec: InvoiceSpec): string {
  return spec.invoice_id ?? `INV-${String(spec.row_id).padStart(3, "0")}`;
}

export function invoiceNumberOf(spec: InvoiceSpec): string | null {
  return spec.number_missing ? null : `INV-${1000 + spec.row_id}`;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";
}

export interface SeedFiles {
  "manifest.json": string;
  "customers.csv": string;
  "invoices.csv": string;
  "payments.csv": string;
  "emails.json": string;
}

/** Builds every seed file's contents. Pure and deterministic. */
/**
 * TKT-75.08 (FS14–FS17): unapplied bank lines appended after P-012, so no
 * existing payment id, invoice or PRNG filler moves. Amounts are chosen
 * against the generated ledger and pinned by `scripts/seed.test.ts`.
 */
export interface PaymentFixtureSpec {
  payment_id: string;
  paid_days_ago: number;
  amount_rupees: number;
  payer_customer_id?: string;
  remittance_reference?: string;
  edge_cases: EdgeCase[];
}

export const PAYMENT_FIXTURES: PaymentFixtureSpec[] = [
  // Equals both halves of C-009's duplicate pair (1019/1020): no pick.
  { payment_id: "P-013", paid_days_ago: 2, amount_rupees: 48_000, payer_customer_id: "C-009", edge_cases: ["FS14"] },
  // C-004 (Deccan Logistics) owes ₹2,90,000 across INV-D, INV-J and 1034;
  // this line pays ₹20,000 more than that.
  { payment_id: "P-014", paid_days_ago: 2, amount_rupees: 310_000, payer_customer_id: "C-004", edge_cases: ["FS15"] },
  // Cites "INV-1O37" (capital letter O, not zero). Its amount equals 1037's
  // outstanding, but the reference names no invoice, so nothing is matched.
  { payment_id: "P-015", paid_days_ago: 3, amount_rupees: 88_000, remittance_reference: "INV-1O37", edge_cases: ["FS16"] },
  // No payer, no reference, and no open invoice has this outstanding.
  { payment_id: "P-016", paid_days_ago: 4, amount_rupees: 61_500, edge_cases: ["FS17"] },
];

export function generateSeed(): SeedFiles {
  const rand = mulberry32(PRNG_SEED);
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const terms = new Map(CUSTOMERS.map((c) => [c.customer_id, c.payment_terms_days]));
  const generated = new Map<
    number,
    { invoiceDate: string; amountRupees: number; billingPeriod: string; po: string | null }
  >();

  const invoiceRows: (string | number | null)[][] = [];
  const paymentRows: (string | number | null)[][] = [];

  for (const spec of INVOICES) {
    const termsDays = terms.get(spec.customer_id);
    if (termsDays === undefined) throw new Error(`unknown customer ${spec.customer_id}`);
    const original = spec.duplicate_of === undefined ? undefined : generated.get(spec.duplicate_of);
    if (spec.duplicate_of !== undefined && original === undefined) {
      throw new Error(`row ${spec.row_id} duplicates unknown row ${spec.duplicate_of}`);
    }

    // Every row draws the same number of PRNG values, in row order, so
    // editing one scenario's explicit values never shifts another row's filler.
    const randOverdue = randInt(15, 75);
    const randNotDue = -randInt(5, 25);
    const randAmount = randInt(30, 1100) * 500; // ₹15,000 – ₹5,50,000, in ₹500 steps.
    const randLate = randInt(0, 30);
    const randIssuedDaysAgo = randInt(10, 40); // for rows with no due date.

    let daysOverdue: number | null;
    if (original !== undefined) {
      // A re-issue: same billing, issued three days after the original.
      daysOverdue = Math.round((Date.parse(SEED_AS_OF) - Date.parse(original.invoiceDate)) / MS_PER_DAY) - termsDays - 3;
    } else if (spec.days_overdue === "rand-overdue") {
      daysOverdue = randOverdue;
    } else if (spec.days_overdue === "rand-not-due") {
      daysOverdue = randNotDue;
    } else {
      daysOverdue = spec.days_overdue;
    }

    const dueDate = daysOverdue === null ? null : addDays(SEED_AS_OF, -daysOverdue);
    const invoiceDate =
      dueDate === null ? addDays(SEED_AS_OF, -randIssuedDaysAgo) : addDays(dueDate, -termsDays);
    const amountRupees = original?.amountRupees ?? spec.amount_rupees ?? randAmount;
    const billingPeriod = original?.billingPeriod ?? invoiceDate.slice(0, 7);
    const po = original ? original.po : spec.po_missing ? null : `PO-${4500 + spec.row_id}`;
    generated.set(spec.row_id, { invoiceDate, amountRupees, billingPeriod, po });

    const invoiceId = invoiceIdOf(spec);
    const amountPaise = amountRupees * 100;

    if (spec.paid_late_days !== undefined) {
      if (dueDate === null) throw new Error(`row ${spec.row_id}: paid row needs a due date`);
      const late = spec.paid_late_days === "rand" ? randLate : spec.paid_late_days;
      paymentRows.push([`P-${String(paymentRows.length + 1).padStart(3, "0")}`, invoiceId, addDays(dueDate, late), amountPaise]);
    }
    if (spec.partial_payment) {
      paymentRows.push([
        `P-${String(paymentRows.length + 1).padStart(3, "0")}`,
        invoiceId,
        spec.partial_payment.paid_on,
        spec.partial_payment.rupees * 100,
      ]);
    }

    invoiceRows.push([
      spec.row_id,
      invoiceId,
      invoiceNumberOf(spec),
      spec.customer_id,
      invoiceDate,
      dueDate,
      amountPaise,
      "INR",
      spec.status_raw ?? "open",
      spec.supplied_outstanding_rupees === undefined ? null : spec.supplied_outstanding_rupees * 100,
      billingPeriod,
      po,
    ]);
  }

  // TKT-75.02 (TC-75.06): one unapplied bank line — no invoice on it — whose
  // amount matches exactly one open invoice's outstanding (INV-F, ₹25,000).
  // Appended after the loop so no other row's id or PRNG filler moves. The
  // bank line's own reference is the remittance; there is no email for it.
  paymentRows.push([`P-${String(paymentRows.length + 1).padStart(3, "0")}`, null, addDays(SEED_AS_OF, -1), 25_000 * 100]);
  for (const f of PAYMENT_FIXTURES) {
    const id = `P-${String(paymentRows.length + 1).padStart(3, "0")}`;
    if (id !== f.payment_id) throw new Error(`payment fixture ${f.payment_id} would be written as ${id}`);
    paymentRows.push([id, null, addDays(SEED_AS_OF, -f.paid_days_ago), f.amount_rupees * 100, f.payer_customer_id ?? null, f.remittance_reference ?? null]);
  }
  // Every row carries the two optional TKT-75.08 columns (blank on v1 rows).
  for (const row of paymentRows) while (row.length < 6) row.push(null);

  const customersCsv = toCsv(
    ["customer_id", "name", "contact_emails", "payment_terms_days", "segment"],
    CUSTOMERS.map((c) => [c.customer_id, c.name, c.contact_emails.join(";"), c.payment_terms_days, c.segment]),
  );

  const invoicesCsv = toCsv(
    [
      "row_id",
      "invoice_id",
      "invoice_number",
      "customer_id",
      "invoice_date",
      "due_date",
      "amount_paise",
      "currency",
      "status_raw",
      "outstanding_amount",
      "billing_period",
      "po_number",
    ],
    invoiceRows,
  );

  const paymentsCsv = toCsv(
    ["payment_id", "invoice_id", "paid_on", "amount_paise", "payer_customer_id", "remittance_reference"],
    paymentRows,
  );

  const emails = THREADS.map((t) => ({
    thread_id: t.thread_id,
    message_id: `${t.thread_id}-1`,
    from_address: t.from_address,
    sent_at: t.sent_at,
    subject: t.subject,
    body: t.body,
  }));

  const manifest = {
    seedVersion: SEED_VERSION,
    invoices: "/seed/invoices.csv",
    customers: "/seed/customers.csv",
    payments: "/seed/payments.csv",
    emails: "/seed/emails.json",
  };

  return {
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    "customers.csv": customersCsv,
    "invoices.csv": invoicesCsv,
    "payments.csv": paymentsCsv,
    "emails.json": JSON.stringify(emails, null, 2) + "\n",
  };
}

/** Writes the seed files into `dir` (created if absent). */
export function writeSeed(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(generateSeed())) {
    writeFileSync(join(dir, name), contents, "utf-8");
  }
}

// Run only when invoked directly (`pnpm seed`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = join(process.cwd(), "public", "seed");
  writeSeed(outDir);
  console.log(`seed ${SEED_VERSION} written to ${outDir}`);
}
