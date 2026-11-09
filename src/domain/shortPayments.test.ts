import { describe, expect, it } from "vitest";

import { paise } from "./money";
import { ExceptionSchema, type Invoice, type Payment } from "./schema";
import { hasShortPaymentPattern, shortPaymentExceptionsFor, shortPaymentsOf } from "./shortPayments";

function inv(invoice_id: string, customer_id: string, amount: number, status: Invoice["status"] = "paid"): Invoice {
  return {
    row_id: 1,
    invoice_id,
    invoice_number: invoice_id,
    customer_id,
    invoice_date: "2026-06-01",
    due_date: "2026-07-01",
    amount_paise: paise(amount),
    currency: "INR",
    status_raw: status,
    status,
    billing_period: null,
    po_number: null,
  };
}

function pay(payment_id: string, invoice_id: string | null, paid_on: string, amount: number, deduction_reason?: string): Payment {
  return {
    payment_id,
    invoice_id,
    paid_on,
    amount_paise: paise(amount),
    ...(deduction_reason !== undefined && { deduction_reason }),
  };
}

/** Three invoices for C-1, each paid ₹1,000 short, on the given dates. */
function threeShort(dates: [string, string, string], reasons: (string | undefined)[] = ["Pricing", undefined, "Damage"]) {
  return {
    invoices: [inv("INV-1", "C-1", 1_000_000), inv("INV-2", "C-1", 1_000_000), inv("INV-3", "C-1", 1_000_000)],
    payments: dates.map((d, i) => pay(`P-${i + 1}`, `INV-${i + 1}`, d, 900_000, reasons[i])),
  };
}

describe("shortPaymentsOf — what counts as a short payment", () => {
  it("is a paid invoice whose applied payments fall below its amount; the gap is the deduction", () => {
    const out = shortPaymentsOf({
      invoices: [inv("INV-1", "C-1", 1_000_000), inv("INV-2", "C-1", 1_000_000), inv("INV-3", "C-1", 1_000_000, "partially_paid")],
      payments: [
        pay("P-1", "INV-1", "2026-07-01", 900_000, "Pricing"),
        pay("P-2", "INV-2", "2026-07-02", 1_000_000), // paid in full: not short
        pay("P-3", "INV-3", "2026-07-03", 500_000), // still open: a partial payment, not a deduction
      ],
    });
    expect(out).toEqual([
      {
        invoice_id: "INV-1",
        customer_id: "C-1",
        payment_id: "P-1",
        paid_on: "2026-07-01",
        invoice_paise: 1_000_000,
        paid_paise: 900_000,
        deducted_paise: 100_000,
        reason: "Pricing",
      },
    ]);
  });

  it("a paid invoice with no applied payment at all is not a short payment (nothing was paid)", () => {
    expect(shortPaymentsOf({ invoices: [inv("INV-1", "C-1", 1_000_000)], payments: [] })).toEqual([]);
  });

  it("several payments on one invoice: one instance, keyed by the latest bank line", () => {
    const [sp] = shortPaymentsOf({
      invoices: [inv("INV-1", "C-1", 1_000_000)],
      payments: [pay("P-2", "INV-1", "2026-07-09", 400_000, "Damage"), pay("P-1", "INV-1", "2026-07-01", 500_000)],
    });
    expect(sp).toMatchObject({ payment_id: "P-2", paid_on: "2026-07-09", paid_paise: 900_000, deducted_paise: 100_000, reason: "Damage" });
  });
});

describe("hasShortPaymentPattern — TC-75.27 window boundaries", () => {
  it("three within 90 days is a pattern; exactly 90 days apart still counts", () => {
    expect(hasShortPaymentPattern(["2026-07-01", "2026-08-01", "2026-09-01"])).toBe(true);
    expect(hasShortPaymentPattern(["2026-07-01", "2026-08-01", "2026-09-29"])).toBe(true); // 90 days
  });
  it("three spread over more than 90 days is not", () => {
    expect(hasShortPaymentPattern(["2026-07-01", "2026-08-01", "2026-09-30"])).toBe(false); // 91 days
  });
  it("two is never a pattern", () => {
    expect(hasShortPaymentPattern(["2026-07-01", "2026-07-02"])).toBe(false);
  });
  it("any three consecutive dates inside a 90-day window count, in any input order", () => {
    expect(hasShortPaymentPattern(["2026-12-01", "2026-01-01", "2026-11-01", "2026-10-15"])).toBe(true);
  });
});

describe("shortPaymentExceptionsFor — TC-75.27 detection", () => {
  it("≥3 in 90 days: every short payment is an instance and exactly one pattern links them all", () => {
    const out = shortPaymentExceptionsFor(threeShort(["2026-07-12", "2026-08-08", "2026-09-04"]));
    const instances = out.filter((x) => x.kind === "short_payment");
    const patterns = out.filter((x) => x.kind === "short_payment_pattern");
    expect(instances.map((x) => x.review_id)).toEqual(["RV-SP-INV-1", "RV-SP-INV-2", "RV-SP-INV-3"]);
    expect(patterns).toHaveLength(1);
    const [p] = patterns;
    expect(p).toMatchObject({ review_id: "RV-SPP-C-1", customer_id: "C-1", deducted_paise: 300_000, requires_role: "manager" });
    expect(p!.linked_review_ids).toEqual(["RV-SP-INV-1", "RV-SP-INV-2", "RV-SP-INV-3"]);
    for (const x of instances) expect(x.linked_review_ids).toEqual(["RV-SPP-C-1"]);
    for (const x of out) expect(ExceptionSchema.safeParse(x).success, x.review_id).toBe(true);
  });

  it("two short payments in 90 days: instances, but no pattern", () => {
    const ledger = threeShort(["2026-07-12", "2026-08-08", "2026-09-04"]);
    ledger.payments[2] = pay("P-3", "INV-3", "2026-09-04", 1_000_000); // INV-3 paid in full
    const out = shortPaymentExceptionsFor(ledger);
    expect(out.map((x) => x.kind)).toEqual(["short_payment", "short_payment"]);
    for (const x of out) expect(x.linked_review_ids).toEqual([]);
  });

  it("three spread over more than 90 days: instances, but no pattern", () => {
    const out = shortPaymentExceptionsFor(threeShort(["2026-07-01", "2026-08-01", "2026-09-30"]));
    expect(out.filter((x) => x.kind === "short_payment")).toHaveLength(3);
    expect(out.filter((x) => x.kind === "short_payment_pattern")).toEqual([]);
  });

  it("patterns are per customer: three short payments split across customers are not one pattern", () => {
    const ledger = threeShort(["2026-07-01", "2026-07-02", "2026-07-03"]);
    ledger.invoices[2] = inv("INV-3", "C-2", 1_000_000);
    expect(shortPaymentExceptionsFor(ledger).filter((x) => x.kind === "short_payment_pattern")).toEqual([]);
  });

  it("is pure and deterministic", () => {
    const ledger = threeShort(["2026-07-12", "2026-08-08", "2026-09-04"]);
    expect(shortPaymentExceptionsFor(ledger)).toEqual(shortPaymentExceptionsFor(structuredClone(ledger)));
  });
});

describe("shortPaymentExceptionsFor — TC-75.28 FS18 missing reason", () => {
  const out = shortPaymentExceptionsFor(threeShort(["2026-07-12", "2026-08-08", "2026-09-04"]));
  const byId = new Map(out.map((x) => [x.review_id, x]));

  it("a short payment with no stated reason says it needs review and assumes no deduction type", () => {
    const x = byId.get("RV-SP-INV-2")!;
    expect(x.validation_status).toBe("missing");
    expect(x.deduction_reason).toBeUndefined();
    expect(x.recommendation).toMatch(/^Needs review/);
    // No deduction type is inferred: none of the known reasons leak into it.
    expect(`${x.recommendation} ${x.escalation_reason}`).not.toMatch(/pricing|damage|penalty|discount|tds/i);
  });

  it("a stated reason is carried verbatim", () => {
    const x = byId.get("RV-SP-INV-1")!;
    expect(x.validation_status).toBe("verified");
    expect(x.deduction_reason).toBe("Pricing");
    expect(x.escalation_reason).toContain("“Pricing”");
  });

  it("a pattern with any reason-less instance is itself 'missing'", () => {
    expect(byId.get("RV-SPP-C-1")!.validation_status).toBe("missing");
  });
});
