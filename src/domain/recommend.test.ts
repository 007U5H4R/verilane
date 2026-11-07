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

  it("m4: one of two candidates is no longer on the ledger: rejected, never upgraded to high confidence", () => {
    const invoices = [invoice("INV-002", 4_000_000)];
    const payments = [pay("P-012", null, 4_000_000)];
    const result = recommendForException(
      exception({ candidate_invoice_ids: ["INV-002", "INV-003"] }),
      payments,
      invoices,
      customer,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toMatch(/INV-003/);
  });

  it("every candidate is no longer on the ledger: rejected", () => {
    const payments = [pay("P-012", null, 2_500_000)];
    const result = recommendForException(exception(), payments, [], customer);
    expect(result.ok).toBe(false);
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

// TASK-79.8 fix (TC-75.37/TC-75.38 at unit level; see decisions.md EXE161).
// Recommend must never upgrade a cited-but-unknown reference to a confident
// pick, and an overpayment from a named payer proposes only the matched portion.
describe("recommendForException — FS16 remittance reference (TASK-79.8)", () => {
  const cited = (ref: string): Payment => ({ ...pay("P-012", null, 2_500_000), remittance_reference: ref });

  it("a reference that names no candidate: low confidence, cited verbatim, never matched by similarity", () => {
    const invoices = [invoice("INV-037", 2_500_000)]; // invoice_number INV-1037
    const result = recommendForException(exception({ candidate_invoice_ids: ["INV-037"] }), [cited("INV-1O37")], invoices, customer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.confidence).toBe("low");
    expect(result.value.facts).toContainEqual({
      claimId: "RV-PAY-P-012:remittance_reference",
      kind: "remittance_reference",
      value: "INV-1O37",
      evidenceId: "P-012:payments.csv:remittance_reference",
    });
    expect(result.value.recommendation_text).toBe(
      'Remittance cites "INV-1O37", which matches no invoice number; it is not matched by similarity. Requires review.',
    );
  });

  it("a reference equal to the single candidate's invoice_number keeps high confidence", () => {
    const invoices = [invoice("INV-037", 2_500_000)];
    const result = recommendForException(exception({ candidate_invoice_ids: ["INV-037"] }), [cited("INV-1037")], invoices, customer);
    expect(result.ok && result.value.confidence).toBe("high");
  });

  it("zero candidates with a reference: rejected, and the reason quotes the reference verbatim", () => {
    const result = recommendForException(exception({ candidate_invoice_ids: [] }), [cited("INV-9999")], [], customer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe(
      'Cannot recommend: no open invoice matches this payment\'s amount, and the cited reference "INV-9999" matches no invoice number.',
    );
  });
});

describe("recommendForException — FS15 overpayment from a named payer (TASK-79.8)", () => {
  const payer = (amount: number): Payment => ({ ...pay("P-012", null, amount), payer_customer_id: "C-006" });
  const open = [invoice("INV-001", 1_000_000), invoice("INV-002", 1_500_000)];

  it("pays more than the payer owes: proposes the open balance, holds the excess unapplied, low confidence", () => {
    const result = recommendForException(exception({ candidate_invoice_ids: [] }), [payer(3_000_000)], open, undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.confidence).toBe("low");
    expect(result.value.candidate_invoice_ids).toEqual(["INV-001", "INV-002"]);
    expect(result.value.proposed_allocation_paise).toBe(2_500_000);
    expect(result.value.unapplied_excess_paise).toBe(500_000);
    expect(result.value.recommendation_text).toBe(
      "₹30,000.00 exceeds C-006's open balance of ₹25,000.00: propose allocating ₹25,000.00 across INV-1001, INV-1002 and holding ₹5,000.00 as unapplied cash. Requires review.",
    );
  });

  it("a named payer whose open balance covers the payment is not an overpayment: still cannot recommend", () => {
    const result = recommendForException(exception({ candidate_invoice_ids: [] }), [payer(2_000_000)], open, undefined);
    expect(result.ok).toBe(false);
  });

  it("a named payer with no open balance: cannot recommend (nothing to propose)", () => {
    const result = recommendForException(exception({ candidate_invoice_ids: [] }), [payer(2_000_000)], [], undefined);
    expect(result.ok).toBe(false);
  });

  it("paid, written-off and fully settled invoices are not part of the open balance", () => {
    const paid = { ...invoice("INV-003", 9_000_000), status: "paid" as const };
    const settled = invoice("INV-004", 700_000);
    const payments = [payer(3_000_000), pay("P-001", "INV-004", 700_000)];
    const result = recommendForException(exception({ candidate_invoice_ids: [] }), payments, [...open, paid, settled], undefined);
    expect(result.ok && result.value.proposed_allocation_paise).toBe(2_500_000);
  });
});
