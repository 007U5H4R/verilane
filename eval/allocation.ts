/**
 * Allocation-recommendation accuracy (TKT-75.08, TC-75.40; AI-Evaluation.md §2/§3).
 *
 * Pure scorer: runs each labelled bank line through the app's own pipeline
 * (`paymentExceptionsFor` → `recommendForException` → `decidePolicyVerdict`)
 * and compares Policy's verdict with the hand label. No I/O, no clock.
 *
 * Confusion matrix, positive = Policy says `auto_permitted` (an auto-pick):
 *   TP  labelled auto, auto-picked, and the picked invoice is the labelled one
 *   FP  auto-picked when the label says escalate, or auto-picked the wrong invoice
 *   TN  labelled escalate, escalated
 *   FN  labelled auto, escalated
 */
import { paise } from "@/domain/money";
import { decidePolicyVerdict, type PolicyVerdict } from "@/domain/policy";
import { recommendForException } from "@/domain/recommend";
import { paymentExceptionsFor } from "@/domain/review";
import { isPaymentExceptionKind, type Customer, type Invoice, type Payment } from "@/domain/schema";

export const ALLOCATION_THRESHOLDS = { unambiguous_correct: 1, ambiguous_escalated: 1 } as const;

export type AllocationExpected =
  | { verdict: "auto_permitted"; invoice_id: string }
  /** Escalated. `invoice_id` set: a unique match escalated only for amount (G4), Recommend must still name it. */
  | { verdict: Exclude<PolicyVerdict, "auto_permitted">; invoice_id?: string };

export interface AllocationLabel {
  id: string;
  payment_id: string;
  /** True when no single invoice can be picked safely (FS14–FS17 shapes). */
  ambiguous: boolean;
  expected: AllocationExpected;
  note: string;
}

export interface AllocationCase extends AllocationLabel {
  invoices: Invoice[];
  payments: Payment[];
  customers: Customer[];
}

export interface CaseOutcome {
  id: string;
  ambiguous: boolean;
  verdict: PolicyVerdict;
  gate_id: string;
  picked_invoice_id?: string;
  correct: boolean;
  cell: "tp" | "fp" | "tn" | "fn";
}

export interface Rate {
  passed: number;
  total: number;
  rate: number;
  failures: string[];
}

export interface AllocationScore {
  cases: CaseOutcome[];
  unambiguous_correct: Rate;
  ambiguous_escalated: Rate;
  confusion: { tp: number; fp: number; tn: number; fn: number };
}

function outcomeOf(c: AllocationCase): CaseOutcome {
  const exception = paymentExceptionsFor({ invoices: c.invoices, payments: c.payments }).find(
    (e) => e.payment_id === c.payment_id,
  );
  const payment = c.payments.find((p) => p.payment_id === c.payment_id);
  if (!exception || !payment || !isPaymentExceptionKind(exception.kind)) {
    throw new Error(`allocation case ${c.id}: ${c.payment_id} is not an unapplied bank line`);
  }
  // As the detail page does (hooks.ts useException): the first candidate's customer.
  const first = c.invoices.find((i) => i.invoice_id === exception.candidate_invoice_ids?.[0]);
  const customer = c.customers.find((x) => x.customer_id === first?.customer_id);
  const rec = recommendForException(exception, c.payments, c.invoices, customer, () => "2026-10-30T09:00:00.000Z");
  const verdict = decidePolicyVerdict({
    kind: exception.kind,
    amountPaise: payment.amount_paise,
    confidence: rec.ok ? rec.value.confidence : undefined,
  });
  if (!verdict.ok) throw new Error(`allocation case ${c.id}: ${verdict.error.reason}`);
  const decision = verdict.value;
  const named = rec.ok && rec.value.confidence === "high" ? rec.value.candidate_invoice_ids[0] : undefined;

  const autoPicked = decision.verdict === "auto_permitted";
  const labelledAuto = c.expected.verdict === "auto_permitted";
  const invoiceOk = c.expected.invoice_id === undefined || named === c.expected.invoice_id;
  const correct = decision.verdict === c.expected.verdict && invoiceOk;
  const cell = autoPicked ? (labelledAuto && invoiceOk ? "tp" : "fp") : labelledAuto ? "fn" : "tn";
  return {
    id: c.id,
    ambiguous: c.ambiguous,
    verdict: decision.verdict,
    gate_id: decision.gate_id,
    ...(named !== undefined ? { picked_invoice_id: named } : {}),
    correct,
    cell,
  };
}

function rate(outcomes: CaseOutcome[], pass: (o: CaseOutcome) => boolean): Rate {
  const failures = outcomes.filter((o) => !pass(o)).map((o) => `${o.id} (${o.gate_id} ${o.verdict})`);
  const passed = outcomes.length - failures.length;
  return { passed, total: outcomes.length, rate: outcomes.length === 0 ? 0 : passed / outcomes.length, failures };
}

export function scoreAllocation(cases: readonly AllocationCase[]): AllocationScore {
  const outcomes = cases.map(outcomeOf);
  const count = (cell: CaseOutcome["cell"]) => outcomes.filter((o) => o.cell === cell).length;
  return {
    cases: outcomes,
    unambiguous_correct: rate(
      outcomes.filter((o) => !o.ambiguous),
      (o) => o.correct,
    ),
    // Escalated means "never auto-picked"; the label's exact verdict must also hold.
    ambiguous_escalated: rate(
      outcomes.filter((o) => o.ambiguous),
      (o) => o.verdict !== "auto_permitted" && o.correct,
    ),
    confusion: { tp: count("tp"), fp: count("fp"), tn: count("tn"), fn: count("fn") },
  };
}

/** Hand labels for the committed seed's unapplied bank lines (scripts/seed.ts). */
export const SEED_ALLOCATION_LABELS: AllocationLabel[] = [
  {
    id: "S-P-012",
    payment_id: "P-012",
    ambiguous: false,
    expected: { verdict: "auto_permitted", invoice_id: "INV-F" },
    note: "₹25,000 equals INV-F's outstanding only; under the ₹5,00,000 limit (G5)",
  },
  { id: "S-FS14", payment_id: "P-013", ambiguous: true, expected: { verdict: "needs_manager" }, note: "fits INV-019 and INV-020 equally" },
  { id: "S-FS15", payment_id: "P-014", ambiguous: true, expected: { verdict: "needs_manager" }, note: "exceeds C-004's open balance" },
  { id: "S-FS16", payment_id: "P-015", ambiguous: true, expected: { verdict: "needs_manager" }, note: 'cites "INV-1O37" (letter O)' },
  { id: "S-FS17", payment_id: "P-016", ambiguous: true, expected: { verdict: "blocked" }, note: "untraceable to any customer" },
];

// ── Held-out set: small inline ledgers that share no fixture with the seed ──

const CUSTOMERS: Customer[] = ["C-901", "C-902"].map((customer_id) => ({
  customer_id,
  name: `Held-out ${customer_id}`,
  contact_emails: [],
  payment_terms_days: 30,
  segment: "smb",
}));

function inv(invoice_id: string, rupees: number, customer_id = "C-901"): Invoice {
  return {
    row_id: Number(invoice_id.slice(4)),
    invoice_id,
    invoice_number: invoice_id.replace("INV-", "INV-1"),
    customer_id,
    invoice_date: "2026-09-01",
    due_date: "2026-10-01",
    amount_paise: paise(rupees * 100),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
  };
}

function line(rupees: number, extra: Partial<Payment> = {}): Payment {
  return { payment_id: "P-900", invoice_id: null, paid_on: "2026-10-29", amount_paise: paise(rupees * 100), ...extra };
}

/** A bank line already applied to an invoice, so it reduces that invoice's outstanding. */
function applied(payment_id: string, invoice_id: string, rupees: number): Payment {
  return { payment_id, invoice_id, paid_on: "2026-10-01", amount_paise: paise(rupees * 100) };
}

function heldout(
  id: string,
  ambiguous: boolean,
  expected: AllocationExpected,
  note: string,
  invoices: Invoice[],
  payments: Payment[],
): AllocationCase {
  return { id, payment_id: "P-900", ambiguous, expected, note, invoices, payments, customers: CUSTOMERS };
}

export const HELDOUT_ALLOCATION_CASES: AllocationCase[] = [
  heldout(
    "H-UNIQUE-SMALL",
    false,
    { verdict: "auto_permitted", invoice_id: "INV-201" },
    "one exact match under the limit",
    [inv("INV-201", 40_000), inv("INV-202", 55_000)],
    [line(40_000)],
  ),
  heldout(
    "H-UNIQUE-PARTLY-PAID",
    false,
    { verdict: "auto_permitted", invoice_id: "INV-203" },
    "matches the outstanding, not the face amount",
    [inv("INV-203", 50_000), inv("INV-204", 30_000, "C-902"), inv("INV-205", 50_000)],
    [line(30_000), applied("P-901", "INV-204", 30_000), applied("P-902", "INV-203", 20_000), applied("P-903", "INV-205", 50_000)],
  ),
  heldout(
    "H-CORRECT-REF",
    false,
    { verdict: "auto_permitted", invoice_id: "INV-221" },
    "reference equals the single match's invoice number",
    [inv("INV-221", 30_000), inv("INV-222", 31_000)],
    [line(30_000, { remittance_reference: "INV-1221" })],
  ),
  heldout(
    "H-UNIQUE-LARGE",
    false,
    { verdict: "needs_manager", invoice_id: "INV-211" },
    "one exact match over ₹5,00,000: named, but Manager approves (G4)",
    [inv("INV-211", 600_000)],
    [line(600_000)],
  ),
  heldout(
    "H-TIE-2",
    true,
    { verdict: "needs_manager" },
    "two invoices with the same outstanding",
    [inv("INV-201", 48_000), inv("INV-202", 48_000, "C-902")],
    [line(48_000)],
  ),
  heldout(
    "H-TIE-3",
    true,
    { verdict: "needs_manager" },
    "three invoices with the same outstanding",
    [inv("INV-231", 12_000), inv("INV-232", 12_000), inv("INV-233", 12_000, "C-902")],
    [line(12_000)],
  ),
  heldout(
    "H-OVERPAY",
    true,
    { verdict: "needs_manager" },
    "named payer pays more than its whole open balance",
    [inv("INV-241", 60_000, "C-902"), inv("INV-242", 40_000, "C-902"), inv("INV-243", 125_000)],
    [line(125_000, { payer_customer_id: "C-902" }), applied("P-904", "INV-243", 125_000)],
  ),
  heldout(
    "H-MISTYPED-REF",
    true,
    { verdict: "needs_manager" },
    "amount fits one invoice but the cited reference is a transposed number",
    [inv("INV-241", 70_000)],
    [line(70_000, { remittance_reference: "INV-1214" })],
  ),
  heldout(
    "H-UNKNOWN-REF",
    true,
    { verdict: "blocked" },
    "cites a reference that names nothing, and no amount fits",
    [inv("INV-251", 10_000)],
    [line(8_800, { remittance_reference: "PO-77" })],
  ),
  heldout(
    "H-UNTRACEABLE",
    true,
    { verdict: "blocked" },
    "no payer, no reference, no amount match",
    [inv("INV-261", 10_000)],
    [line(9_999)],
  ),
];
