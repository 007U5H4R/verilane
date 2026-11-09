/**
 * Short-payment-pattern detection (TKT-75.05, TC-75.31; AI-Evaluation.md §2/§3).
 *
 * Pure scorer: runs each labelled customer's ledger through the app's own
 * `shortPaymentExceptionsFor` (FS18/FS19, TKT-75.05) and compares its output
 * with the hand label. No I/O, no clock.
 *
 * Confusion matrix, positive = a `short_payment_pattern` row for that customer:
 *   TP  ≥3 short payments within 90 days, pattern raised, correctly linked
 *   FP  pattern raised when the label says no pattern should exist
 *   TN  no pattern labelled, none raised
 *   FN  a pattern should exist (≥3 within 90 days) but none was raised
 */
import { shortPaymentExceptionsFor, type ShortPaymentLedger } from "@/domain/shortPayments";
import { paise } from "@/domain/money";
import type { Invoice, Payment } from "@/domain/schema";

export const SHORT_PAYMENT_PATTERN_THRESHOLDS = {
  pattern_recall: 1,
  pattern_precision: 1,
  instance_recall: 1,
} as const;

export interface ShortPaymentPatternLabel {
  id: string;
  customer_id: string;
  /** Whether this customer should get exactly one `short_payment_pattern` row. */
  expectPattern: boolean;
  /** Every invoice_id that should surface as its own `short_payment` instance. */
  expectedInstanceInvoiceIds: string[];
  note: string;
}

export interface ShortPaymentPatternCase extends ShortPaymentPatternLabel {
  invoices: readonly Invoice[];
  payments: readonly Payment[];
}

export interface CaseOutcome {
  id: string;
  customer_id: string;
  expectPattern: boolean;
  predictedPattern: boolean;
  instancesOk: boolean;
  cell: "tp" | "fp" | "tn" | "fn";
}

export interface Rate {
  passed: number;
  total: number;
  rate: number;
  failures: string[];
}

export interface ShortPaymentPatternScore {
  cases: CaseOutcome[];
  pattern_recall: Rate;
  pattern_precision: Rate;
  instance_recall: Rate;
  confusion: { tp: number; fp: number; tn: number; fn: number };
}

function outcomeOf(c: ShortPaymentPatternCase): CaseOutcome {
  const ledger: ShortPaymentLedger = { invoices: c.invoices, payments: c.payments };
  const exceptions = shortPaymentExceptionsFor(ledger);
  const predictedPattern = exceptions.some(
    (e) => e.kind === "short_payment_pattern" && e.customer_id === c.customer_id,
  );
  const instanceIds = exceptions
    .filter((e) => e.kind === "short_payment" && e.customer_id === c.customer_id)
    .map((e) => e.invoice_id)
    .sort();
  const expected = [...c.expectedInstanceInvoiceIds].sort();
  const instancesOk = JSON.stringify(instanceIds) === JSON.stringify(expected);
  const cell: CaseOutcome["cell"] = predictedPattern
    ? c.expectPattern
      ? "tp"
      : "fp"
    : c.expectPattern
      ? "fn"
      : "tn";
  return { id: c.id, customer_id: c.customer_id, expectPattern: c.expectPattern, predictedPattern, instancesOk, cell };
}

function rate(outcomes: CaseOutcome[], pass: (o: CaseOutcome) => boolean): Rate {
  const failures = outcomes.filter((o) => !pass(o)).map((o) => `${o.id} (${o.customer_id})`);
  const passed = outcomes.length - failures.length;
  return { passed, total: outcomes.length, rate: outcomes.length === 0 ? 0 : passed / outcomes.length, failures };
}

export function scoreShortPaymentPattern(cases: readonly ShortPaymentPatternCase[]): ShortPaymentPatternScore {
  const outcomes = cases.map(outcomeOf);
  const count = (cell: CaseOutcome["cell"]) => outcomes.filter((o) => o.cell === cell).length;
  return {
    cases: outcomes,
    // Recall: of every case that should raise a pattern, the fraction that did (and linked correctly).
    pattern_recall: rate(
      outcomes.filter((o) => o.expectPattern),
      (o) => o.predictedPattern && o.instancesOk,
    ),
    // Precision: of every case that raised a pattern, the fraction that should have.
    pattern_precision: rate(
      outcomes.filter((o) => o.predictedPattern),
      (o) => o.expectPattern,
    ),
    // Every short payment surfaces as its own instance, pattern or not (AC: "every short payment visible").
    instance_recall: rate(outcomes, (o) => o.instancesOk),
    confusion: { tp: count("tp"), fp: count("fp"), tn: count("tn"), fn: count("fn") },
  };
}

// ── Held-out set: small inline ledgers that share no fixture with the seed ──

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `base` (YYYY-MM-DD) plus `n` whole days, exact (no calendar hand-counting). */
function addDays(base: string, n: number): string {
  return new Date(Date.parse(base) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

let rowId = 9_000;

function paidInvoice(invoiceId: string, customerId: string, rupees: number): Invoice {
  return {
    row_id: rowId++,
    invoice_id: invoiceId,
    invoice_number: invoiceId.replace("INV-", "INV-1"),
    customer_id: customerId,
    invoice_date: "2026-01-01",
    due_date: "2026-02-01",
    amount_paise: paise(rupees * 100),
    currency: "INR",
    status_raw: "paid",
    status: "paid",
    billing_period: null,
    po_number: null,
  };
}

function shortPayment(paymentId: string, invoiceId: string, paidOn: string, paidRupees: number, reason?: string): Payment {
  return {
    payment_id: paymentId,
    invoice_id: invoiceId,
    paid_on: paidOn,
    amount_paise: paise(paidRupees * 100),
    ...(reason !== undefined ? { deduction_reason: reason } : {}),
  };
}

/** One customer short-paying `n` invoices by ₹100 each, `n` days apart starting at `base`. */
function shorted(customerId: string, base: string, n: number, spacingDays: number): { invoices: Invoice[]; payments: Payment[]; ids: string[] } {
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `INV-${customerId}-${i}`;
    ids.push(id);
    invoices.push(paidInvoice(id, customerId, 1_000));
    payments.push(shortPayment(`P-${customerId}-${i}`, id, addDays(base, i * spacingDays), 900, "Stated reason"));
  }
  return { invoices, payments, ids };
}

function heldout(
  id: string,
  customer_id: string,
  expectPattern: boolean,
  expectedInstanceInvoiceIds: string[],
  note: string,
  invoices: Invoice[],
  payments: Payment[],
): ShortPaymentPatternCase {
  return { id, customer_id, expectPattern, expectedInstanceInvoiceIds, note, invoices, payments };
}

export const HELDOUT_SHORT_PAYMENT_PATTERN_CASES: ShortPaymentPatternCase[] = [
  (() => {
    const { invoices, payments, ids } = shorted("HC-1", "2026-01-01", 2, 10);
    return heldout("H-TWO-IN-WINDOW", "HC-1", false, ids, "2 short payments inside 90 days: below PATTERN_MIN, no pattern", invoices, payments);
  })(),
  (() => {
    const { invoices, payments, ids } = shorted("HC-2", "2026-01-01", 3, 60);
    return heldout("H-THREE-SPREAD", "HC-2", false, ids, "3 short payments 120 days apart (first to last): outside the 90-day window", invoices, payments);
  })(),
  (() => {
    const { invoices, payments, ids } = shorted("HC-3", "2026-01-01", 3, 45);
    return heldout("H-THREE-EXACT-90", "HC-3", true, ids, "3 short payments exactly 90 days apart (first to last): boundary is inclusive", invoices, payments);
  })(),
  (() => {
    const offsets = [0, 45, 91]; // first to last = 91 days: one day outside the window.
    const ids = offsets.map((_, i) => `INV-HC-4-${i}`);
    const invoices = ids.map((id) => paidInvoice(id, "HC-4", 1_000));
    const payments = ids.map((id, i) => shortPayment(`P-HC-4-${i}`, id, addDays("2026-01-01", offsets[i]!), 900, "Stated reason"));
    return heldout("H-THREE-91", "HC-4", false, ids, "3 short payments 91 days apart (first to last): one day outside the window, no pattern", invoices, payments);
  })(),
  (() => {
    const outlier = shorted("HC-5", "2025-01-01", 1, 0);
    const cluster = shorted("HC-5", "2026-01-01", 3, 30);
    // Distinct ids/payment ids: the outlier's index-0 naming would collide with the cluster's.
    const outlierInvoice = { ...outlier.invoices[0]!, invoice_id: "INV-HC-5-OUTLIER" };
    const outlierPayment = { ...outlier.payments[0]!, payment_id: "P-HC-5-OUTLIER", invoice_id: "INV-HC-5-OUTLIER" };
    const ids = [outlierInvoice.invoice_id, ...cluster.ids];
    return heldout(
      "H-FOUR-SUBSET",
      "HC-5",
      true,
      ids,
      "4 short payments: 1 far outlier plus 3 clustered within 90 days — the pattern still links all 4",
      [outlierInvoice, ...cluster.invoices],
      [outlierPayment, ...cluster.payments],
    );
  })(),
  (() => {
    const invoice = paidInvoice("INV-HC-6-0", "HC-6", 1_000);
    const payment = shortPayment("P-HC-6-0", "INV-HC-6-0", "2026-01-01", 1_000);
    return heldout("H-NO-SHORT", "HC-6", false, [], "paid in full: not a short payment at all", [invoice], [payment]);
  })(),
  (() => {
    const { invoices, payments, ids } = shorted("HC-7", "2026-01-01", 1, 0);
    return heldout("H-ONE-SHORT", "HC-7", false, ids, "a single short payment: never enough for a pattern on its own", invoices, payments);
  })(),
];
