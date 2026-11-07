import { describe, expect, it } from "vitest";
import { exceptionsFor, paymentExceptionsFor, type ReviewLedger } from "./review";
import { EXTRACTION_SCHEMA_VERSION, ExceptionSchema, type Extraction, type Invoice, type Match, type Payment } from "./schema";
import { paise } from "./money";

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

const ledger: ReviewLedger = {
  invoices: [invoice("INV-042", 34_000_000), invoice("INV-023", 10_000_000), invoice("INV-024", 10_000_000)],
  payments: [],
};

function ext(overrides: Partial<Extraction> = {}): Extraction {
  return {
    message_id: "E-007-1",
    thread_id: "E-007",
    mode: "simulated",
    provider: "simulated",
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    email_class: "confirmation",
    signals: [],
    invoice_refs: ["INV-1042"],
    amounts: [30_000_000],
    dates: [],
    commitment_date: null,
    payment_claim: { paid_on: "2026-10-27", amount_paise: 30_000_000 },
    missing_info: [],
    status: "valid",
    ...overrides,
  };
}

const matched = (invoice_id: string, candidates = [invoice_id], message_id = "E-007-1"): Match => ({
  message_id,
  outcome: "matched",
  customer_id: "C-006",
  invoice_id,
  candidates,
  reason: "r",
});

describe("exceptionsFor", () => {
  it("TC-030: a ₹3,00,000 claim against ₹3,40,000 outstanding → reconciliation with both amounts; ledger untouched", () => {
    const before = structuredClone(ledger);
    const items = exceptionsFor(matched("INV-042"), ext(), ledger);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item?.kind).toBe("reconciliation");
    expect(item?.invoice_id).toBe("INV-042");
    expect(item?.email_amount_paise).toBe(30_000_000);
    expect(item?.ledger_outstanding_paise).toBe(34_000_000);
    expect(item?.validation_status).toBe("conflict");
    expect(item?.requires_role).toBe("manager");
    expect(item?.evidence_ids).toContain("E-007-1:emails.json:amounts[0]");
    expect(ledger).toEqual(before);
    for (const i of items) expect(() => ExceptionSchema.parse(i)).not.toThrow();
  });

  it("a claim equal to the outstanding still reconciles: the ledger has no payment yet", () => {
    const items = exceptionsFor(
      matched("INV-042"),
      ext({ amounts: [34_000_000], payment_claim: { paid_on: null, amount_paise: 34_000_000 } }),
      ledger,
    );
    expect(items[0]?.kind).toBe("reconciliation");
    expect(items[0]?.validation_status).toBe("verified");
  });

  it("no item when the ledger already shows the invoice settled", () => {
    const settled: ReviewLedger = {
      ...ledger,
      payments: [{ payment_id: "P-1", invoice_id: "INV-042", paid_on: "2026-10-27", amount_paise: paise(34_000_000) }],
    };
    expect(exceptionsFor(matched("INV-042"), ext(), settled)).toEqual([]);
  });

  it("TC-033 (FS6): a duplicate claim → linked reconciliation items on both invoices", () => {
    const items = exceptionsFor(
      matched("INV-024", ["INV-023", "INV-024"], "E-016-1"),
      ext({
        message_id: "E-016-1",
        email_class: "duplicate",
        dispute_type: "duplicate_invoice",
        invoice_refs: ["INV-1023", "INV-1024"],
        amounts: [],
        payment_claim: null,
      }),
      ledger,
    );
    expect(items.map((i) => i.invoice_id)).toEqual(["INV-023", "INV-024"]);
    expect(items.every((i) => i.kind === "reconciliation")).toBe(true);
    expect(items[0]?.linked_review_ids).toEqual([items[1]?.review_id]);
    expect(items[1]?.linked_review_ids).toEqual([items[0]?.review_id]);
  });

  it("a matched dispute → a Manager dispute item", () => {
    const items = exceptionsFor(
      matched("INV-042", ["INV-042"], "E-011-1"),
      ext({ message_id: "E-011-1", email_class: "dispute", dispute_type: "incorrect_amount", payment_claim: null }),
      ledger,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("dispute");
    expect(items[0]?.requires_role).toBe("manager");
    expect(items[0]?.evidence_ids).toContain("E-011-1:emails.json:email_class");
  });

  it("a matched commitment needs no review", () => {
    const items = exceptionsFor(
      matched("INV-042"),
      ext({ email_class: "commitment", payment_claim: null, commitment_date: "2026-11-06" }),
      ledger,
    );
    expect(items).toEqual([]);
  });

  it.each(["ambiguous", "customer_only", "unresolved"] as const)(
    "every %s outcome → one uncertain_match item with no invoice",
    (outcome) => {
      const m: Match = { message_id: "E-024-1", outcome, candidates: ["INV-024"], reason: "possible transposition of INV-1042" };
      const items = exceptionsFor(m, ext({ message_id: "E-024-1", email_class: "commitment", payment_claim: null }), ledger);
      expect(items).toHaveLength(1);
      expect(items[0]?.kind).toBe("uncertain_match");
      expect(items[0]?.invoice_id).toBeUndefined();
      expect(items[0]?.escalation_reason).toBe("possible transposition of INV-1042");
      expect(items[0]?.requires_role).toBe("analyst");
      expect(() => ExceptionSchema.parse(items[0])).not.toThrow();
    },
  );
});

// TC-75.07 (TKT-75.02): one unallocated_payment exception per unapplied
// payment, deterministic, with the open invoices whose outstanding equals
// the payment as candidates.
describe("paymentExceptionsFor — TC-75.07", () => {
  const pay = (payment_id: string, invoice_id: string | null, amount: number): Payment => ({
    payment_id,
    invoice_id,
    paid_on: "2026-10-29",
    amount_paise: paise(amount),
  });
  const invoices = [
    invoice("INV-001", 2_500_000),
    invoice("INV-002", 4_000_000),
    invoice("INV-003", 4_000_000),
    { ...invoice("INV-004", 9_900_000), status: "paid" as const },
    { ...invoice("INV-005", 9_900_000), status: "written_off" as const },
  ];

  it("raises one open, verified exception naming the single candidate", () => {
    const out = paymentExceptionsFor({ invoices, payments: [pay("P-012", null, 2_500_000)] });
    expect(out).toEqual([
      {
        review_id: "RV-PAY-P-012",
        kind: "unallocated_payment",
        payment_id: "P-012",
        invoice_id: "INV-001",
        candidate_invoice_ids: ["INV-001"],
        linked_review_ids: [],
        recommendation: "Allocate this payment to INV-001 after checking the bank line",
        evidence_ids: ["P-012:payments.csv:amount_paise", "P-012:payments.csv:invoice_id"],
        validation_status: "verified",
        escalation_reason: "Bank line has no invoice; its amount matches exactly one open invoice",
        requires_role: "analyst",
        status: "open",
      },
    ]);
    for (const x of out) expect(ExceptionSchema.safeParse(x).success).toBe(true);
  });

  it("is deterministic: the same ledger gives the same exceptions", () => {
    const ledger = { invoices, payments: [pay("P-1", null, 2_500_000), pay("P-2", null, 4_000_000)] };
    expect(paymentExceptionsFor(ledger)).toEqual(paymentExceptionsFor(structuredClone(ledger)));
  });

  it("ignores applied payments and never offers a closed invoice", () => {
    expect(paymentExceptionsFor({ invoices, payments: [pay("P-1", "INV-001", 2_500_000)] })).toEqual([]);
    const [x] = paymentExceptionsFor({ invoices, payments: [pay("P-9", null, 9_900_000)] });
    expect(x).toMatchObject({ candidate_invoice_ids: [], validation_status: "missing" });
    expect(x?.invoice_id).toBeUndefined();
  });

  it("an invoice already settled by an applied payment is not a candidate", () => {
    const [x] = paymentExceptionsFor({
      invoices,
      payments: [pay("P-1", "INV-001", 2_500_000), pay("P-2", null, 2_500_000)],
    });
    expect(x?.candidate_invoice_ids).toEqual([]);
  });

  it("two equal candidates: conflict, no invoice picked", () => {
    const [x] = paymentExceptionsFor({ invoices, payments: [pay("P-2", null, 4_000_000)] });
    expect(x).toMatchObject({ candidate_invoice_ids: ["INV-002", "INV-003"], validation_status: "conflict" });
    expect(x?.invoice_id).toBeUndefined();
  });
});
