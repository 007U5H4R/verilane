import { describe, expect, it } from "vitest";
import { reviewItemsFor, type ReviewLedger } from "./review";
import { EXTRACTION_SCHEMA_VERSION, ReviewItemSchema, type Extraction, type Invoice, type Match } from "./schema";

function invoice(invoice_id: string, amount_paise: number): Invoice {
  return {
    row_id: 1,
    invoice_id,
    invoice_number: invoice_id.replace("INV-0", "INV-10"),
    customer_id: "C-006",
    invoice_date: "2026-09-01",
    due_date: "2026-10-01",
    amount_paise,
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

describe("reviewItemsFor", () => {
  it("TC-030: a ₹3,00,000 claim against ₹3,40,000 outstanding → reconciliation with both amounts; ledger untouched", () => {
    const before = structuredClone(ledger);
    const items = reviewItemsFor(matched("INV-042"), ext(), ledger);
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
    for (const i of items) expect(() => ReviewItemSchema.parse(i)).not.toThrow();
  });

  it("a claim equal to the outstanding still reconciles: the ledger has no payment yet", () => {
    const items = reviewItemsFor(
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
      payments: [{ payment_id: "P-1", invoice_id: "INV-042", paid_on: "2026-10-27", amount_paise: 34_000_000 }],
    };
    expect(reviewItemsFor(matched("INV-042"), ext(), settled)).toEqual([]);
  });

  it("TC-033 (FS6): a duplicate claim → linked reconciliation items on both invoices", () => {
    const items = reviewItemsFor(
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
    const items = reviewItemsFor(
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
    const items = reviewItemsFor(
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
      const items = reviewItemsFor(m, ext({ message_id: "E-024-1", email_class: "commitment", payment_claim: null }), ledger);
      expect(items).toHaveLength(1);
      expect(items[0]?.kind).toBe("uncertain_match");
      expect(items[0]?.invoice_id).toBeUndefined();
      expect(items[0]?.escalation_reason).toBe("possible transposition of INV-1042");
      expect(items[0]?.requires_role).toBe("analyst");
      expect(() => ReviewItemSchema.parse(items[0])).not.toThrow();
    },
  );
});
