import { describe, expect, it } from "vitest";
import { recommendForException } from "./recommend";
import { paise } from "./money";
import type { Customer, Exception, Invoice, Payment } from "./schema";

// TC-006/TC-007 (docs/test-cases.md; TKT-75.03 brief calls these TC-75.14ff,
// confirmed divergence — see decisions.md EXE130). Recommend agent: output
// is verified facts only, traced to a source record (R5/F13).

function invoice(invoice_id: string, amount_paise: number): Invoice {
  return {
    row_id: 1,
    invoice_id,
    invoice_number: invoice_id.replace("INV-0", "INV-10"),
    customer_id: "C-006",
    invoice_date: "2026-09-01",
    due_date: "2026-10-01",
    amount_paise: paise(amount_paise),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
  };
}

function pay(payment_id: string, invoice_id: string | null, amount: number): Payment {
  return { payment_id, invoice_id, paid_on: "2026-10-29", amount_paise: paise(amount) };
}

function exception(overrides: Partial<Exception> = {}): Exception {
  return {
    review_id: "RV-PAY-P-012",
    kind: "unallocated_payment",
    linked_review_ids: [],
    recommendation: "",
    evidence_ids: [],
    validation_status: "verified",
    escalation_reason: "",
    requires_role: "analyst",
    status: "open",
    payment_id: "P-012",
    candidate_invoice_ids: ["INV-001"],
    ...overrides,
  };
}

const customer: Customer = {
  customer_id: "C-006",
  name: "Acme Co",
  contact_emails: ["ap@acme.example"],
  payment_terms_days: 30,
  segment: "mid-market",
};

describe("recommendForException — TC-006", () => {
  it("one candidate: recommends it at high confidence, with facts traced to a source", () => {
    const invoices = [invoice("INV-001", 2_500_000)];
    const payments = [pay("P-012", null, 2_500_000)];
    const result = recommendForException(exception(), payments, invoices, customer, () => "2026-11-05T00:00:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.confidence).toBe("high");
    expect(result.value.recommendation_text).toBe("₹25,000.00 matches INV-1001 exactly.");
    expect(result.value.candidate_invoice_ids).toEqual(["INV-001"]);
    for (const fact of result.value.facts) {
      expect(fact.evidenceId).toMatch(/\.csv:/);
    }
    expect(result.value.facts.some((f) => f.kind === "amount")).toBe(true);
    expect(result.value.facts.some((f) => f.kind === "invoice_number")).toBe(true);
  });
});

describe("recommendForException — TC-007", () => {
  it("two candidates: ambiguous, low confidence, cites every candidate", () => {
    const invoices = [invoice("INV-002", 4_000_000), invoice("INV-003", 4_000_000)];
    const payments = [pay("P-012", null, 4_000_000)];
    const result = recommendForException(
      exception({ candidate_invoice_ids: ["INV-002", "INV-003"] }),
      payments,
      invoices,
      customer,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.confidence).toBe("low");
    expect(result.value.recommendation_text).toBe("Cannot determine which invoice; requires review.");
    expect(result.value.candidate_invoice_ids).toEqual(["INV-002", "INV-003"]);
    const invoiceNumberFacts = result.value.facts.filter((f) => f.kind === "invoice_number");
    expect(invoiceNumberFacts).toHaveLength(2);
  });
});

describe("recommendForException — F13 cannot-recommend", () => {
  it("zero candidates: Result<false> with a human-readable reason, never a recommendation", () => {
    const invoices = [invoice("INV-001", 2_500_000)];
    const payments = [pay("P-012", null, 9_900_000)];
    const result = recommendForException(exception({ candidate_invoice_ids: [] }), payments, invoices, customer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toMatch(/cannot recommend/i);
  });

  it("the payment is no longer on the ledger: rejected, not recommended", () => {
    const invoices = [invoice("INV-001", 2_500_000)];
    const result = recommendForException(exception(), [], invoices, customer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toMatch(/no longer on the ledger/i);
  });

  it("a non-payment exception kind is rejected (Recommend is payment-exception only)", () => {
    const result = recommendForException(
      exception({ kind: "uncertain_match", message_id: "E-1" }),
      [],
      [],
      undefined,
    );
    expect(result.ok).toBe(false);
  });
});

describe("recommendForException — determinism", () => {
  it("two runs on the same input produce byte-identical output (minus the clock)", () => {
    const invoices = [invoice("INV-001", 2_500_000)];
    const payments = [pay("P-012", null, 2_500_000)];
    const now = () => "2026-11-05T00:00:00.000Z";
    const a = recommendForException(exception(), payments, invoices, customer, now);
    const b = recommendForException(exception(), structuredClone(payments), structuredClone(invoices), customer, now);
    expect(a).toEqual(b);
  });
});
