import { describe, expect, it } from "vitest";
import { buildDraft, factsFor, locateFootnotes } from "./draft";
import { paise } from "./money";
import type { Customer, Extraction, Invoice, Match, ReviewItem, VerifiedFact } from "./schema";
import { draftContextFor, findUnverifiedTokens, validate, type DraftSources, type DraftUnderCheck } from "./validate";

const invoice: Invoice = {
  row_id: 12,
  invoice_id: "INV-A",
  invoice_number: "INV-1012",
  customer_id: "C-001",
  invoice_date: "2026-08-14",
  due_date: "2026-09-13",
  amount_paise: paise(34_000_000),
  currency: "INR",
  status_raw: "Open",
  status: "open",
  billing_period: null,
  po_number: null,
};
const customers: Customer[] = [
  { customer_id: "C-001", name: "Aravalli Textiles Pvt Ltd", contact_emails: ["ap@a.example"], payment_terms_days: 30, segment: "SME" },
  { customer_id: "C-002", name: "Bharat Polymers Ltd", contact_emails: [], payment_terms_days: 30, segment: "SME" },
];

function sources(over: Partial<DraftSources> = {}): DraftSources {
  return {
    asOf: "2026-10-30",
    invoices: [invoice],
    customers,
    payments: [],
    extractions: [],
    matches: [],
    disputes: [],
    reviewItems: [],
    ...over,
  };
}

function draftFor(src: DraftSources, edit?: (body: string, facts: VerifiedFact[]) => string): DraftUnderCheck {
  const ctx = draftContextFor("INV-A", src);
  if (!ctx.invoice) throw new Error("fixture invoice missing");
  const facts = factsFor(ctx.invoice, ctx.customer, paise(ctx.outstanding), src.asOf);
  const built = buildDraft(facts);
  if (!edit) return { body: built.body, facts, footnotes: built.footnotes };
  const body = edit(built.body, facts);
  return { body, facts, footnotes: locateFootnotes(body, facts) };
}

function failedIds(src: DraftSources, edit?: (body: string, facts: VerifiedFact[]) => string): number[] {
  const d = draftFor(src, edit);
  return validate(d, draftContextFor("INV-A", src))
    .filter((c) => !c.passed)
    .map((c) => c.id);
}

const extraction = (message_id: string, email_class: Extraction["email_class"], extra: Partial<Extraction> = {}): Extraction =>
  ({
    message_id,
    thread_id: "T-1",
    email_class,
    invoice_refs: ["INV-1012"],
    amounts: [],
    dates: [],
    commitment_date: null,
    payment_claim: null,
    status: "valid",
    missing_info: [],
    ...extra,
  }) as unknown as Extraction;

const matched = (message_id: string, candidates = ["INV-A"]): Match =>
  ({ message_id, outcome: "matched", customer_id: "C-001", invoice_id: "INV-A", candidates, reason: "" }) as Match;

describe("validate (TC-041)", () => {
  it("returns nine checks, ids 1-9, all passing on a clean generated draft", () => {
    const src = sources();
    const checks = validate(draftFor(src), draftContextFor("INV-A", src));
    expect(checks.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(checks.every((c) => c.passed)).toBe(true);
    for (const c of checks) expect(c.reason).not.toBe("");
  });

  it("1 fails when the invoice is missing", () => {
    const src = sources();
    const d = draftFor(src);
    const checks = validate(d, draftContextFor("INV-A", sources({ invoices: [] })));
    expect(checks.find((c) => c.id === 1)?.passed).toBe(false);
  });

  it("2 fails when the stated customer is not the invoice's customer", () => {
    const src = sources();
    const d = draftFor(src);
    d.facts = d.facts.map((f) => (f.kind === "customer_name" ? { ...f, value: "Bharat Polymers Ltd" } : f));
    expect(validate(d, draftContextFor("INV-A", src)).find((c) => c.id === 2)?.passed).toBe(false);
  });

  it("3 fails when the stated amount differs from outstanding", () => {
    const src = sources();
    const d = draftFor(src);
    const ctx = draftContextFor("INV-A", sources({ payments: [{ payment_id: "P", invoice_id: "INV-A", paid_on: "2026-10-01", amount_paise: paise(100) }] }));
    expect(validate(d, ctx).find((c) => c.id === 3)?.passed).toBe(false);
  });

  it("4 fails without a currency", () => {
    expect(failedIds(sources({ invoices: [{ ...invoice, currency: null }] }))).toContain(4);
  });

  it("5 fails without a due date", () => {
    expect(failedIds(sources({ invoices: [{ ...invoice, due_date: null }] }))).toContain(5);
  });

  it("6 fails on an open dispute record, and passes once it is resolved", () => {
    const open = sources({ disputes: [{ dispute_id: "DS-1", invoice_id: "INV-A", status: "under_review", type: "incorrect_amount" }] });
    expect(failedIds(open)).toEqual([6]);
    const closed = sources({ disputes: [{ dispute_id: "DS-1", invoice_id: "INV-A", status: "resolved", type: "incorrect_amount" }] });
    expect(failedIds(closed)).toEqual([]);
  });

  it("6 fails on a matched dispute email or a duplicate claim naming the invoice", () => {
    expect(failedIds(sources({ extractions: [extraction("E-1", "dispute", { dispute_type: "incorrect_amount" } as Partial<Extraction>)], matches: [matched("E-1")] }))).toEqual([6]);
    expect(
      failedIds(
        sources({
          extractions: [extraction("E-2", "duplicate", { dispute_type: "duplicate_invoice" } as Partial<Extraction>)],
          matches: [{ ...matched("E-2", ["INV-Z", "INV-A"]), invoice_id: "INV-Z" }],
        }),
      ),
    ).toEqual([6]);
  });

  it("an unmatched or rejected email raises nothing", () => {
    const src = sources({
      extractions: [extraction("E-1", "dispute", { dispute_type: "incorrect_amount", status: "rejected" } as Partial<Extraction>)],
      matches: [matched("E-1")],
    });
    expect(failedIds(src)).toEqual([]);
  });

  it("7 fails on a matched payment confirmation", () => {
    expect(failedIds(sources({ extractions: [extraction("E-3", "confirmation")], matches: [matched("E-3")] }))).toEqual([7]);
  });

  it("8 fails when the invoice is paid or written off", () => {
    expect(failedIds(sources({ invoices: [{ ...invoice, status: "paid" }] }))).toContain(8);
    expect(failedIds(sources({ invoices: [{ ...invoice, status: "written_off" }] }))).toContain(8);
  });
});

describe("check 9 (TC-043)", () => {
  const append = (text: string) => (body: string) => `${body}\n${text}`;
  const swap = (kind: string, text: string) => (body: string, facts: VerifiedFact[]) => {
    const f = facts.find((x) => x.kind === kind);
    return f ? body.replace(f.value, text) : body;
  };

  it.each([
    ["an amount", swap("amount", "₹3,00,000")],
    ["a date", append("Please pay by 5 November 2026.")],
    ["a DD/MM date", append("We noted your promise for 20/10/2026.")],
    ["an ISO date", append("Due 2026-11-05.")],
    ["an invoice ref", append("This also covers INV-1048.")],
    ["another customer", swap("customer_name", "Bharat Polymers Ltd")],
    ["a lakh amount", append("The balance of 3.4 lakh is overdue.")],
    ["a bare number", swap("days_overdue", "15")],
    ["Rs. amount", append("Pay Rs. 500 now.")],
  ])("fails on %s outside a footnote", (_label, edit) => {
    expect(failedIds(sources(), edit)).toEqual([9]);
  });

  it("passes on a benign edit and on a repeated verified fact", () => {
    expect(failedIds(sources(), append("Thank you for your continued business."))).toEqual([]);
    expect(failedIds(sources(), append("Again: INV-1012."))).toEqual([]);
  });

  it("reports the offending tokens", () => {
    const body = "Pay INV-9 by 20/10/2026 to Bharat Polymers Ltd.";
    const tokens = findUnverifiedTokens(body, [], ["Bharat Polymers Ltd"]);
    expect(tokens).toEqual(["INV-9", "20/10/2026", "Bharat Polymers Ltd"]);
  });
});

describe("draftContextFor", () => {
  it("flags an ambiguous match and an open conflicting reconciliation", () => {
    const item: ReviewItem = {
      review_id: "RV-E-7-reconcile",
      kind: "reconciliation",
      message_id: "E-7",
      invoice_id: "INV-A",
      linked_review_ids: [],
      recommendation: "",
      evidence_ids: [],
      validation_status: "conflict",
      escalation_reason: "",
      requires_role: "manager",
      status: "open",
    };
    const ctx = draftContextFor(
      "INV-A",
      sources({
        matches: [{ message_id: "E-9", outcome: "ambiguous", candidates: ["INV-A", "INV-B"], reason: "" } as Match],
        reviewItems: [item],
      }),
    );
    expect(ctx.ambiguousMatch).toBe(true);
    expect(ctx.conflictingPayment).toBe(true);
    expect(ctx.outstanding).toBe(34_000_000);
  });

  describe("FS11: a rejected extraction under review blocks drafts (TASK-22, TC-071)", () => {
    const rejected = extraction("E-5", "unknown", {
      status: "rejected",
      rejection_reason: "cross-check failed; invoice_refs.0: INV-9999 does not appear in the email",
      invoice_refs: [],
    });
    const customerOnly = {
      message_id: "E-5",
      outcome: "customer_only",
      customer_id: "C-001",
      candidates: ["INV-A"],
      reason: "",
    } as Match;
    const review = (status: ReviewItem["status"]): ReviewItem => ({
      review_id: "RV-E-5-match",
      kind: "uncertain_match",
      message_id: "E-5",
      linked_review_ids: [],
      recommendation: "",
      evidence_ids: [],
      validation_status: "missing",
      escalation_reason: "",
      requires_role: "analyst",
      status,
    });

    it("fails check 6 while the review item is open", () => {
      const src = sources({ extractions: [rejected], matches: [customerOnly], reviewItems: [review("open")] });
      expect(draftContextFor("INV-A", src).disputed).toContain("E-5");
      expect(failedIds(src)).toContain(6);
    });

    it("does not block an invoice the email cannot be about", () => {
      const src = sources({
        extractions: [rejected],
        matches: [{ ...customerOnly, candidates: ["INV-B"] }],
        reviewItems: [review("open")],
      });
      expect(draftContextFor("INV-A", src).disputed).toBeNull();
    });

    it("clears once a person has dealt with the review item", () => {
      const src = sources({ extractions: [rejected], matches: [customerOnly], reviewItems: [review("dismissed")] });
      expect(draftContextFor("INV-A", src).disputed).toBeNull();
    });
  });
});
