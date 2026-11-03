import { describe, expect, it } from "vitest";
import { match, normaliseAddress, normaliseRef, type MatchLedger } from "./match";
import { EXTRACTION_SCHEMA_VERSION, type Customer, type EmailMessage, type Extraction, type Invoice } from "./schema";
import { paise } from "./money";

function customer(customer_id: string, contact_emails: string[]): Customer {
  return { customer_id, name: customer_id, contact_emails, payment_terms_days: 30, segment: "SMB" };
}

function invoice(invoice_id: string, invoice_number: string | null, customer_id: string, invoice_date = "2026-09-01"): Invoice {
  return {
    row_id: 1,
    invoice_id,
    invoice_number,
    customer_id,
    invoice_date,
    due_date: "2026-10-01",
    amount_paise: paise(34_000_000),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
  };
}

const ledger: MatchLedger = {
  customers: [
    customer("C-006", ["ap@gangasteel.test", "treasury@gangasteel.test"]),
    customer("C-007", ["accounts@himalayaelectricals.test"]),
  ],
  invoices: [
    invoice("INV-042", "INV-1042", "C-006"),
    invoice("INV-031", "INV-1031", "C-006"),
    invoice("INV-023", "INV-1023", "C-007", "2026-09-01"),
    invoice("INV-024", "INV-1024", "C-007", "2026-09-05"),
  ],
};

function msg(from_address: string): EmailMessage {
  return {
    thread_id: "E-900",
    message_id: "E-900-1",
    from_address,
    sent_at: "2026-10-28T10:00:00Z",
    subject: "s",
    body: "b",
  };
}

function ext(invoice_refs: string[], overrides: Partial<Extraction> = {}): Extraction {
  return {
    message_id: "E-900-1",
    thread_id: "E-900",
    mode: "simulated",
    provider: "simulated",
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    email_class: "commitment",
    signals: [],
    invoice_refs,
    amounts: [],
    dates: [],
    commitment_date: null,
    payment_claim: null,
    missing_info: [],
    status: "valid",
    ...overrides,
  };
}

describe("normalisation", () => {
  it("lowercases and trims addresses", () => {
    expect(normaliseAddress("  AP@GangaSteel.TEST ")).toBe("ap@gangasteel.test");
  });

  it("uppercases refs and normalises whitespace and dash variants", () => {
    expect(normaliseRef("inv-1042")).toBe("INV-1042");
    expect(normaliseRef(" INV 1042 ")).toBe("INV-1042");
    expect(normaliseRef("INV–1042")).toBe("INV-1042");
    expect(normaliseRef("INV1042")).toBe("INV-1042");
  });
});

// TC-027: strict two-part match.
describe("match — TC-027", () => {
  it("known sender citing a ref they own → matched", () => {
    const m = match(ext(["INV-1042"]), msg("treasury@gangasteel.test"), ledger);
    expect(m.outcome).toBe("matched");
    expect(m.customer_id).toBe("C-006");
    expect(m.invoice_id).toBe("INV-042");
    expect(m.candidates).toEqual(["INV-042"]);
  });

  it("known sender citing a ref owned by another customer → ambiguous", () => {
    const m = match(ext(["INV-1023"]), msg("ap@gangasteel.test"), ledger);
    expect(m.outcome).toBe("ambiguous");
    expect(m.invoice_id).toBeUndefined();
    expect(m.candidates).toContain("INV-023");
    expect(m.reason).toContain("another customer");
  });

  it("known sender with no ref → customer_only", () => {
    const m = match(ext([]), msg("ap@gangasteel.test"), ledger);
    expect(m.outcome).toBe("customer_only");
    expect(m.customer_id).toBe("C-006");
    expect(m.invoice_id).toBeUndefined();
  });

  it("unknown sender → unresolved, even when the ref exists", () => {
    expect(match(ext([]), msg("someone@else.test"), ledger).outcome).toBe("unresolved");
    const m = match(ext(["INV-1042"]), msg("someone@else.test"), ledger);
    expect(m.outcome).toBe("unresolved");
    expect(m.customer_id).toBeUndefined();
    expect(m.invoice_id).toBeUndefined();
  });

  it("uppercase and padded sender addresses still match", () => {
    const m = match(ext(["inv-1042"]), msg("  TREASURY@GangaSteel.test "), ledger);
    expect(m.outcome).toBe("matched");
    expect(m.invoice_id).toBe("INV-042");
  });

  it("two owned refs on a non-duplicate email → ambiguous", () => {
    const m = match(ext(["INV-1042", "INV-1031"]), msg("ap@gangasteel.test"), ledger);
    expect(m.outcome).toBe("ambiguous");
    expect(m.candidates).toEqual(["INV-042", "INV-031"]);
  });

  it("duplicate claim over two owned refs → matched to the later re-issue, both candidates", () => {
    const m = match(
      ext(["INV-1023", "INV-1024"], { email_class: "duplicate", dispute_type: "duplicate_invoice" }),
      msg("accounts@himalayaelectricals.test"),
      ledger,
    );
    expect(m.outcome).toBe("matched");
    expect(m.invoice_id).toBe("INV-024");
    expect(m.candidates).toEqual(["INV-023", "INV-024"]);
  });

  it("a rejected extraction never matches an invoice", () => {
    const m = match(
      ext(["INV-1042"], { status: "rejected", rejection_reason: "bad" }),
      msg("ap@gangasteel.test"),
      ledger,
    );
    expect(m.outcome).toBe("customer_only");
    expect(m.invoice_id).toBeUndefined();
  });
});

// TC-028: transposed digits are flagged, never auto-matched.
describe("match — TC-028 transposition", () => {
  it("INV-1024 from the owner of INV-1042 → ambiguous, possible transposition", () => {
    const m = match(ext(["INV-1024"]), msg("ap@gangasteel.test"), ledger);
    expect(m.outcome).toBe("ambiguous");
    expect(m.reason).toContain("possible transposition of INV-1042");
    expect(m.candidates).toEqual(expect.arrayContaining(["INV-024", "INV-042"]));
    expect(m.invoice_id).toBeUndefined();
  });

  it("an unknown ref that is a transposition of an owned one → ambiguous", () => {
    const m = match(ext(["INV-1013"]), msg("ap@gangasteel.test"), ledger);
    expect(m.outcome).toBe("ambiguous");
    expect(m.reason).toContain("possible transposition of INV-1031");
  });

  it("INV-1043 (one digit off INV-1042) is never matched", () => {
    const m = match(ext(["INV-1043"]), msg("ap@gangasteel.test"), ledger);
    expect(m.outcome).toBe("customer_only");
    expect(m.invoice_id).toBeUndefined();
    expect(match(ext(["INV-1043"]), msg("x@y.test"), ledger).outcome).toBe("unresolved");
  });
});
