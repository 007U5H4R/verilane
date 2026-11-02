import { describe, expect, it } from "vitest";
import { paise } from "../money";
import type { Payment } from "../schema";
import { CUSTOMERS, EMAILS, EXTRACTIONS, INVOICES, MATCHES, PAYMENTS, REVIEW_ITEMS, byId } from "./fixtures";
import {
  MISSING,
  assessCase,
  buildCases,
  candidatesFor,
  caseFacts,
  claimFrom,
  duplicateReferences,
  kpis,
  ledgerStatus,
  remainingAfter,
  workflowOf,
  type CaseContext,
  type StoredReviewItem,
} from "./reconcile";

const invoices = byId(INVOICES, "invoice_id");
const ctx: CaseContext = {
  invoices,
  customers: byId(CUSTOMERS, "customer_id"),
  emails: byId(EMAILS, "message_id"),
  extractions: byId(EXTRACTIONS, "message_id"),
  matches: byId(MATCHES, "message_id"),
  payments: PAYMENTS,
};
const cases = buildCases(REVIEW_ITEMS, ctx.matches, invoices);
const assess = (id: string) => {
  const c = cases.find((k) => k.id === id);
  if (!c) throw new Error(`no case ${id}`);
  return assessCase(c, ctx);
};

describe("buildCases", () => {
  it("one case per email: a duplicate pair is one case, uncertain matches are not cases", () => {
    expect(cases.map((c) => c.id)).toEqual(["E-006-1", "E-007-1", "E-008-1", "E-009-1", "E-016-1"]);
    const dup = cases.find((c) => c.id === "E-016-1");
    expect(dup?.kind).toBe("duplicate_invoice");
    expect(dup?.items).toHaveLength(2);
    expect(dup?.invoiceIds).toEqual(["INV-019", "INV-020"]);
    expect(dup?.customerId).toBe("C-009");
  });
});

describe("claimFrom — literal only", () => {
  it("a relative date is quoted but never resolved (scenario 1)", () => {
    const a = assess("E-006-1");
    expect(a.claim.date).toEqual({ value: MISSING.customer, quote: expect.stringContaining("yesterday"), provided: false });
    expect(a.claim.date_iso).toBeUndefined(); // the extraction's 2026-10-28 is an inference, not shown
    expect(a.claim.method.value).toBe("NEFT");
    expect(a.claim.amount.value).toBe("₹1,25,000");
    expect(a.claim.utr).toEqual({ value: MISSING.customer, provided: false });
    expect(a.claim.invoice.value).toBe("INV-1016");
    expect(a.claim.customer.value).toBe("Deccan Logistics LLP");
    expect(a.claim.customer.quote).toBe("accounts@deccanlogistics.test");
  });

  it("reads a UTR only when the email labels one, and an absolute date as written", () => {
    const a = assess("E-007-1");
    expect(a.claim.utr.value).toBe("GSW2610270042");
    expect(a.claim.utr.quote).toContain("UTR reference GSW2610270042");
    expect(a.claim.date.value).toBe("27/10/2026");
    expect(a.claim.date_iso).toBe("2026-10-27");
    expect(a.claim.method).toEqual({ value: MISSING.customer, provided: false });
  });

  it("never invents a UTR from an all-letter word after 'UTR'", () => {
    const c = claimFrom({
      email: { ...EMAILS[0]!, body: "UTR reference pending, will share." },
      extraction: undefined,
      item: undefined,
      customerName: undefined,
    });
    expect(c.utr.provided).toBe(false);
    expect(c.customer.value).toBe(MISSING.na);
    expect(c.amount.value).toBe(MISSING.customer);
  });
});

describe("candidatesFor — matching hierarchy", () => {
  it("exact same-invoice, same-customer entry is linkable; amount-only on another invoice is not (scenarios 4, 6, 11)", () => {
    const a = assess("E-009-1");
    expect(a.candidates.map((c) => [c.payment.payment_id, c.tier, c.linkable])).toEqual([
      ["P-011", "exact", true],
      ["P-010", "different_invoice", false],
    ]);
    expect(a.candidates[0]?.checks).toEqual({
      invoice: true,
      customer: true,
      utr: "not_available",
      amount: true,
      dateWindow: true,
    });
    expect(a.candidates[1]?.checks.dateWindow).toBe(false);
  });

  it("never lists another customer's payment, even with the same amount (scenario 5)", () => {
    const ids = assess("E-009-1").candidates.map((c) => c.payment.payment_id);
    expect(ids).not.toContain("P-001"); // C-007, ₹50,000
    const p: Payment = { payment_id: "P-Z", invoice_id: "INV-024", paid_on: "2026-10-20", amount_paise: paise(5_000_000) };
    expect(
      candidatesFor({ invoiceId: "INV-024", customerId: "C-004", amount: paise(5_000_000) }, [p], invoices),
    ).toEqual([]);
  });

  it("amount alone is never enough: no invoice means nothing is linkable", () => {
    const out = candidatesFor({ customerId: "C-004", amount: paise(5_000_000) }, PAYMENTS, invoices);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => !c.linkable)).toBe(true);
  });

  it("no customer → no candidates", () => {
    expect(candidatesFor({ invoiceId: "INV-034", amount: paise(5_000_000) }, PAYMENTS, invoices)).toEqual([]);
  });

  it("date window is null without a literal date", () => {
    const out = candidatesFor({ invoiceId: "INV-034", customerId: "C-004", amount: paise(5_000_000) }, PAYMENTS, invoices);
    expect(out[0]?.checks.dateWindow).toBeNull();
  });
});

describe("caseFacts — state mapping", () => {
  it("full claim with no ledger entry → no_ledger_entry (scenarios 1, 17)", () => {
    expect(assess("E-006-1").state).toBe("no_ledger_entry");
    expect(assess("E-008-1").state).toBe("no_ledger_entry");
    expect(assess("E-008-1").partial).toBe(false);
  });

  it("claim differs from outstanding with no entry → amount_mismatch with the discrepancy (scenario 2)", () => {
    const a = assess("E-007-1");
    expect(a.state).toBe("amount_mismatch");
    expect(a.discrepancy).toBe(4_000_000);
  });

  it("partial claim already recorded → exact candidate, partial, remaining not double-subtracted (scenarios 3, 18)", () => {
    const a = assess("E-009-1");
    expect(a.state).toBe("exact_match_candidate");
    expect(a.partial).toBe(true);
    expect(a.recordedPaymentId).toBe("P-011");
    expect(a.outstanding).toBe(15_000_000);
    expect(a.remainingIfConfirmed).toBe(15_000_000); // 2,00,000 − 50,000 already in the ledger
  });

  it("duplicate pair → ambiguous_invoice (scenario 8)", () => {
    expect(assess("E-016-1").state).toBe("ambiguous_invoice");
  });

  it("recorded workflow decisions win over ledger evidence (scenarios 10, 14)", () => {
    const head = REVIEW_ITEMS[3]!;
    const base = { kind: "payment_claim" as const, candidates: [] };
    expect(caseFacts({ ...base, items: [{ ...head, status: "actioned", workflow_state: "verified" }] })).toMatchObject({
      state: "verified",
      open: false,
    });
    expect(caseFacts({ ...base, items: [{ ...head, status: "dismissed" }] }).state).toBe("rejected");
    // Actioned elsewhere (e.g. the queue) without a verification record is never shown as verified.
    expect(caseFacts({ ...base, items: [{ ...head, status: "actioned" }] })).toMatchObject({ state: "closed", open: false });
    expect(caseFacts({ ...base, items: [{ ...head, workflow_state: "manager_review" }] })).toMatchObject({
      state: "manager_review",
      open: true,
    });
    expect(caseFacts({ ...base, items: [{ ...head, workflow_state: "awaiting_evidence" }] }).state).toBe(
      "awaiting_evidence",
    );
  });
});

describe("remainingAfter", () => {
  it("valid part payment leaves the right balance", () => {
    expect(remainingAfter(paise(15_000_000), paise(5_000_000))).toEqual({ remaining: 10_000_000, valid: true });
    expect(remainingAfter(paise(15_000_000), paise(15_000_000))).toEqual({ remaining: 0, valid: true });
  });
  it("rejects zero, negative, fractional and over-outstanding amounts", () => {
    for (const a of [0, -1, 1.5, 15_000_001]) {
      const r = remainingAfter(paise(15_000_000), a as never);
      expect(r.valid).toBe(false);
      expect(r.remaining).toBe(15_000_000);
    }
  });
});

describe("duplicateReferences (scenario 12)", () => {
  it("flags a UTR quoted by more than one email, case-insensitively", () => {
    const d = duplicateReferences([
      { caseId: "A", utr: "GSW1" },
      { caseId: "B", utr: "gsw1" },
      { caseId: "C", utr: "X9" },
      { caseId: "D" },
    ]);
    expect([...d]).toEqual([["GSW1", ["A", "B"]]]);
  });
  it("the seed has no duplicate reference", () => {
    const utrs = cases.map((c) => {
      const a = assessCase(c, ctx);
      return a.claim.utr.provided ? { caseId: c.id, utr: a.claim.utr.value } : { caseId: c.id };
    });
    expect(duplicateReferences(utrs).size).toBe(0);
  });
});

describe("kpis — unique counts, ledger-only total", () => {
  it("counts cases, not review items; totals the ledger only", () => {
    const assessed = cases.map((c) => assessCase(c, ctx));
    const k = kpis(assessed.map((a) => ({ id: a.case.id, open: a.open })), REVIEW_ITEMS, PAYMENTS);
    expect(k.needsReconciliation).toBe(5); // 6 reconciliation items, 5 emails
    expect(k.unmatchedEmails).toBe(1);
    expect(k.ledgerEntries).toBe(3);
    expect(k.ledgerTotal).toBe(15_000_000); // claims never count
  });

  it("never double counts a repeated payment row or a closed case", () => {
    const k = kpis(
      [
        { id: "A", open: true },
        { id: "A", open: true },
        { id: "B", open: false },
      ],
      [...REVIEW_ITEMS, { ...REVIEW_ITEMS[6]!, review_id: "RV-other" }],
      [...PAYMENTS, PAYMENTS[0]!],
    );
    expect(k).toEqual({ needsReconciliation: 1, unmatchedEmails: 1, ledgerEntries: 3, ledgerTotal: 15_000_000 });
  });
});

describe("ledgerStatus and workflowOf", () => {
  it("verified beats candidate beats recorded", () => {
    expect(ledgerStatus("P-1", new Set(["P-1"]), new Set(["P-1"]))).toBe("verified");
    expect(ledgerStatus("P-1", new Set(), new Set(["P-1"]))).toBe("candidate");
    expect(ledgerStatus("P-1", new Set(), new Set())).toBe("recorded");
  });
  it("reads only well-formed workflow fields", () => {
    const row = { workflow_state: "verified", assignee: "boss", verified_payment_id: 7, workflow_note: "n" } as unknown as StoredReviewItem;
    expect(workflowOf(row as unknown as Record<string, unknown>)).toEqual({ workflow_state: "verified", workflow_note: "n" });
  });
});
