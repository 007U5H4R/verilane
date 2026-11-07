/**
 * TC-75.36–TC-75.39 (TKT-75.08): the committed seed's FS14–FS17 bank lines,
 * run through the same pure pipeline the app uses — `paymentExceptionsFor`
 * (review.ts) → Recommend (recommend.ts) → Policy (`decidePolicyVerdict`).
 * The recommender must never guess: each case escalates, and none is
 * `auto_permitted`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { ingest, type Row } from "./ingest";
import { decidePolicyVerdict } from "./policy";
import { outstandingOf } from "./priority";
import { recommendForException } from "./recommend";
import { paymentExceptionsFor } from "./review";
import { isPaymentExceptionKind } from "./schema";

const dir = join(process.cwd(), "public", "seed");
const csv = (name: string) =>
  Papa.parse<Row>(readFileSync(join(dir, name), "utf-8"), { header: true, skipEmptyLines: true }).data;
const ledger = ingest({
  invoices: csv("invoices.csv"),
  customers: csv("customers.csv"),
  payments: csv("payments.csv"),
  emails: [],
});
const exceptions = paymentExceptionsFor(ledger);
const NOW = () => "2026-10-30T09:00:00.000Z";

function run(paymentId: string) {
  const exception = exceptions.find((e) => e.payment_id === paymentId);
  if (!exception || !isPaymentExceptionKind(exception.kind)) throw new Error(`no payment exception for ${paymentId}`);
  const payment = ledger.payments.find((p) => p.payment_id === paymentId)!;
  // As the detail page does (hooks.ts useException): the first candidate's customer.
  const first = ledger.invoices.find((i) => i.invoice_id === exception.candidate_invoice_ids?.[0]);
  const customer = ledger.customers.find((c) => c.customer_id === first?.customer_id);
  const recommendation = recommendForException(exception, ledger.payments, ledger.invoices, customer, NOW);
  const verdict = decidePolicyVerdict({
    kind: exception.kind,
    amountPaise: payment.amount_paise,
    confidence: recommendation.ok ? recommendation.value.confidence : undefined,
  });
  if (!verdict.ok) throw new Error(verdict.error.reason);
  return { exception, payment, recommendation, decision: verdict.value };
}

describe("TC-75.36 — FS14: a payment that fits two invoices equally", () => {
  it("picks neither, exposes every candidate, and needs a Manager", () => {
    const { exception, recommendation, decision } = run("P-013");
    expect(exception.invoice_id).toBeUndefined();
    expect(exception.candidate_invoice_ids).toEqual(["INV-019", "INV-020"]);
    expect(recommendation.ok).toBe(true);
    if (!recommendation.ok) return;
    expect(recommendation.value.confidence).toBe("low");
    expect(recommendation.value.candidate_invoice_ids).toEqual(["INV-019", "INV-020"]);
    const cited = recommendation.value.facts.filter((f) => f.kind === "invoice_number").map((f) => f.value);
    expect(cited).toEqual(["INV-1019", "INV-1020"]);
    expect(recommendation.value.recommendation_text).not.toMatch(/exactly/);
    expect(decision).toMatchObject({ gate_id: "G3", verdict: "needs_manager" });
  });
});

describe("TC-75.37 — FS15: a payment exceeding the customer's open balance", () => {
  it("proposes the matched portion, holds the excess as unapplied, and needs review", () => {
    const { payment, recommendation, decision } = run("P-014");
    const ctx = { payments: ledger.payments };
    const open = ledger.invoices.filter(
      (i) =>
        i.customer_id === "C-004" && i.status !== "paid" && i.status !== "written_off" && outstandingOf(i, ctx) > 0,
    );
    const balance = open.reduce((sum, i) => sum + outstandingOf(i, ctx), 0);
    expect(balance).toBe(29_000_000);
    expect(payment.amount_paise).toBe(31_000_000);

    expect(recommendation.ok).toBe(true);
    if (!recommendation.ok) return;
    expect(recommendation.value.confidence).toBe("low");
    expect([...recommendation.value.candidate_invoice_ids].sort()).toEqual(open.map((i) => i.invoice_id).sort());
    expect(recommendation.value.proposed_allocation_paise).toBe(29_000_000);
    expect(recommendation.value.unapplied_excess_paise).toBe(2_000_000);
    expect(recommendation.value.recommendation_text).toContain("₹2,90,000.00");
    expect(recommendation.value.recommendation_text).toContain("₹20,000.00");
    expect(recommendation.value.recommendation_text).toMatch(/unapplied/);
    expect(decision.verdict).not.toBe("auto_permitted");
    expect(decision).toMatchObject({ gate_id: "G3", verdict: "needs_manager" });
  });
});

describe("TC-75.38 — FS16: an unknown or mistyped invoice reference", () => {
  it("does not fuzzy-match, keeps the cited reference verbatim, and escalates", () => {
    // The typo sits one character from a real invoice number, whose
    // outstanding equals the payment: the trap a fuzzy matcher falls into.
    expect(ledger.invoices.some((i) => i.invoice_number === "INV-1037")).toBe(true);
    expect(ledger.invoices.some((i) => i.invoice_number === "INV-1O37")).toBe(false);

    const { payment, recommendation, decision } = run("P-015");
    expect(payment.remittance_reference).toBe("INV-1O37");
    expect(recommendation.ok).toBe(true);
    if (!recommendation.ok) return;
    expect(recommendation.value.confidence).toBe("low");
    const ref = recommendation.value.facts.find((f) => f.kind === "remittance_reference");
    expect(ref).toEqual({
      claimId: "RV-PAY-P-015:remittance_reference",
      kind: "remittance_reference",
      value: "INV-1O37",
      evidenceId: "P-015:payments.csv:remittance_reference",
    });
    expect(recommendation.value.recommendation_text).toContain('"INV-1O37"');
    expect(recommendation.value.recommendation_text).not.toMatch(/matches INV-1037 exactly/);
    expect(decision.verdict).not.toBe("auto_permitted");
    expect(decision).toMatchObject({ gate_id: "G3", verdict: "needs_manager" });
  });
});

describe("TC-75.39 — FS17: cash untraceable to any customer", () => {
  it("stays unallocated with the reason, and no invoice is touched", () => {
    const { exception, payment, recommendation, decision } = run("P-016");
    expect(payment.invoice_id).toBeNull();
    expect(payment.payer_customer_id).toBeUndefined();
    expect(exception.invoice_id).toBeUndefined();
    expect(exception.candidate_invoice_ids).toEqual([]);
    expect(exception.escalation_reason).toBe("Bank line has no invoice and matches no open invoice");
    expect(recommendation.ok).toBe(false);
    if (recommendation.ok) return;
    expect(recommendation.error.reason).toMatch(/no open invoice matches/);
    expect(decision).toMatchObject({ gate_id: "G2", verdict: "blocked" });
  });
});
