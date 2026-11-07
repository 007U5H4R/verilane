/**
 * TC-003 (TASK-79.1): `Payment.invoice_id` is nullable. A payment with no
 * invoice is "unapplied cash": it never counts against any invoice's
 * outstanding balance, and it is never silently dropped — it is totalled
 * separately. No null coercion ("null" / "" never matches an invoice).
 */
import { describe, expect, it } from "vitest";
import { kpis, unappliedCashPaise, unappliedPayments } from "./aggregates";
import { paise } from "./money";
import { appliedPaiseOf, isUnapplied, outstandingOf } from "./priority";
import { PaymentSchema, type Invoice, type Payment, type Priority } from "./schema";

const inv001: Invoice = {
  row_id: 1,
  invoice_id: "INV-001",
  invoice_number: "INV-001",
  customer_id: "C-001",
  invoice_date: "2026-01-01",
  due_date: "2026-09-01",
  amount_paise: paise(160_000),
  currency: "INR",
  status_raw: "open",
  status: "open",
  billing_period: null,
  po_number: null,
};

const priority: Priority = {
  invoice_id: "INV-001",
  config_version: "priority.v1",
  band: "high",
  factors: [],
  reason: "fixture",
  recommended_action: "fixture",
  days_overdue: 10,
};

// TC-003 data, verbatim.
const payments: Payment[] = [
  { payment_id: "P1", invoice_id: null, paid_on: "2026-09-10", amount_paise: paise(45_000) },
  { payment_id: "P2", invoice_id: "INV-001", paid_on: "2026-09-11", amount_paise: paise(50_000) },
  { payment_id: "P3", invoice_id: "INV-001", paid_on: "2026-09-12", amount_paise: paise(30_000) },
];

describe("Payment.invoice_id nullable — TC-003", () => {
  it("the schema accepts null and still rejects a missing or non-string invoice_id", () => {
    expect(PaymentSchema.safeParse(payments[0]).success).toBe(true);
    const missing: Record<string, unknown> = { ...payments[0] };
    delete missing.invoice_id;
    expect(PaymentSchema.safeParse(missing).success).toBe(false);
    expect(PaymentSchema.safeParse({ ...payments[0], invoice_id: 7 }).success).toBe(false);
  });

  it("INV-001's applied total is 80000 and excludes the null-invoice payment", () => {
    expect(appliedPaiseOf("INV-001", payments)).toBe(80_000);
    expect(outstandingOf(inv001, { payments })).toBe(160_000 - 80_000);
  });

  it("the unapplied payment is counted once in unapplied cash (count 1, total 45000)", () => {
    expect(unappliedPayments(payments).map((p) => p.payment_id)).toEqual(["P1"]);
    expect(unappliedCashPaise(payments)).toBe(45_000);
    expect(isUnapplied(payments[0]!)).toBe(true);
    expect(isUnapplied(payments[1]!)).toBe(false);
  });

  it("nothing is dropped: applied + unapplied = every payment", () => {
    const total = payments.reduce((s, p) => s + p.amount_paise, 0);
    expect(appliedPaiseOf("INV-001", payments) + unappliedCashPaise(payments)).toBe(total);
  });

  it("no null coercion: an empty-string or 'null' invoice id never matches the unapplied payment", () => {
    expect(appliedPaiseOf("", payments)).toBe(0);
    expect(appliedPaiseOf("null", payments)).toBe(0);
  });

  it("Home KPIs run on a ledger with an unapplied payment without crashing", () => {
    const result = kpis({ items: [{ invoice: inv001, priority }], payments });
    expect(result.outstandingPaise).toBe(80_000);
    expect(result.highCount).toBe(1);
  });
});
