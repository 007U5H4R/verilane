import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import { extractTokens } from "./extract";
import { reviewItemsFor } from "./review";
import { EXTRACTION_SCHEMA_VERSION, type Extraction, type Invoice, type Match } from "./schema";

function run(body: string, sent_at = "2026-10-28T09:00:00Z") {
  return classify(extractTokens({ body, sent_at }), body);
}

// TC-023: a class needs its signal AND a supporting token.
describe("classify — support required (TC-023)", () => {
  it("'payment done' without an amount or ref is not a confirmation", () => {
    const c = run("Payment done.");
    expect(c.email_class).not.toBe("confirmation");
    expect(c.signals).not.toContain("confirmation");
  });

  it("'payment done' with a ref is a confirmation", () => {
    expect(run("Payment done for INV-1042.").email_class).toBe("confirmation");
  });

  it("'payment done' with an amount is a confirmation", () => {
    expect(run("Payment done, ₹3,00,000.").email_class).toBe("confirmation");
  });

  it("'we will pay' without a date is not a commitment", () => {
    const c = run("We will pay INV-1042.");
    expect(c.email_class).not.toBe("commitment");
    expect(c.signals).not.toContain("commitment");
    expect(c.commitment_date).toBeNull();
  });

  it("'we will pay' with a future date is a commitment dated to it", () => {
    const c = run("We will pay INV-1042 on 5 Nov 2026.");
    expect(c.email_class).toBe("commitment");
    expect(c.commitment_date).toBe("2026-11-05");
  });

  it("a past date does not support a commitment", () => {
    expect(run("We will pay INV-1042 on 5 Oct 2026.").email_class).not.toBe("commitment");
  });

  it("a bare dispute word with no object is not a dispute", () => {
    expect(run("We dispute this.").email_class).not.toBe("dispute");
    expect(run("We dispute INV-1042.").email_class).toBe("dispute");
  });
});

// TC-024: precedence keeps secondary signals.
describe("classify — precedence (TC-024)", () => {
  it("dispute + commitment → dispute, with commitment kept in signals", () => {
    const c = run("The amount is incorrect on INV-1042. We will pay ₹2,00,000 by 10 Nov 2026.");
    expect(c.email_class).toBe("dispute");
    expect(c.dispute_type).toBe("incorrect_amount");
    expect(c.signals).toEqual(expect.arrayContaining(["dispute", "commitment"]));
  });

  it("confirmation outranks commitment and delay", () => {
    const c = run(
      "Apologies for the delay. We released ₹50,000 against INV-1034 on 20/10/2026; the rest will be paid by 15 Nov 2026.",
    );
    expect(c.email_class).toBe("confirmation");
    expect(c.signals).toEqual(["confirmation", "commitment", "delay"]);
  });

  it("commitment outranks delay", () => {
    expect(run("Sorry for the delay on INV-1012. We will release ₹3,40,000 by 20 Nov 2026.").email_class).toBe(
      "commitment",
    );
  });

  it("duplicate → class duplicate with dispute_type duplicate_invoice", () => {
    const c = run("INV-1020 looks like a duplicate of INV-1019.");
    expect(c.email_class).toBe("duplicate");
    expect(c.dispute_type).toBe("duplicate_invoice");
  });

  it("an already-paid dispute dates the claimed payment", () => {
    const c = run("Please stop the reminders for INV-1039. We already settled it on 12 Sep 2026.");
    expect(c.email_class).toBe("dispute");
    expect(c.dispute_type).toBe("payment_already_completed");
    expect(c.commitment_date).toBe("2026-09-12");
  });

  it("missing-info is an enquiry and lists the items", () => {
    const c = run("We cannot process INV-1043 until you share your GSTIN and the delivery challan number.");
    expect(c.email_class).toBe("enquiry");
    expect(c.missing_info).toEqual(["GSTIN", "delivery challan number"]);
    expect(c.dispute_type).toBeUndefined();
  });

  it("nothing → unknown", () => {
    const c = run("Following up on our call last week about the pending items.");
    expect(c.email_class).toBe("unknown");
    expect(c.signals).toEqual([]);
  });
});

describe("classify — payment claim", () => {
  it("dates a confirmation to the claimed paid date, never a future one", () => {
    const c = run("We paid INV-1016 yesterday via NEFT, ₹1,25,000.", "2026-10-29T08:20:00Z");
    expect(c.email_class).toBe("confirmation");
    expect(c.commitment_date).toBe("2026-10-28");
    expect(c.payment_claim).toEqual({ paid_on: "2026-10-28", amount_paise: 12_500_000 });
  });

  it("has no payment claim for a commitment", () => {
    expect(run("We will pay INV-1042 on 5 Nov 2026.").payment_claim).toBeNull();
  });
});

// M-002 R15: the claimed amount is the one bound to the paid verb, not the first.
describe("classify — payment claim amount (R15)", () => {
  it("invoice amount quoted before the paid amount → records the paid amount", () => {
    const c = run("Against your invoice of ₹3,40,000 we have paid ₹3,00,000 on 12/10.");
    expect(c.email_class).toBe("confirmation");
    expect(c.payment_claim?.amount_paise).toBe(30_000_000);
  });

  it("'Invoice of ₹3,40,000, we paid ₹3,00,000' → ₹3,00,000", () => {
    expect(run("Invoice of ₹3,40,000, we paid ₹3,00,000 for INV-1042.").payment_claim?.amount_paise).toBe(30_000_000);
  });

  it("passive wording binds the amount before the verb", () => {
    const c = run("₹3,00,000 has been paid against INV-1042 (invoice value ₹3,40,000).");
    expect(c.payment_claim?.amount_paise).toBe(30_000_000);
  });

  it("several amounts, none in the paid clause → no claimed amount", () => {
    const c = run("INV-1042 is ₹3,40,000 and INV-1043 is ₹1,00,000. We have paid INV-1042.");
    expect(c.email_class).toBe("confirmation");
    expect(c.payment_claim?.amount_paise).toBeNull();
  });

  it("the short payment surfaces as a conflict against the ledger outstanding", () => {
    const body = "Against your invoice INV-1042 of ₹3,40,000 we have paid ₹3,00,000 on 12/10.";
    const tokens = extractTokens({ body, sent_at: "2026-10-28T09:00:00Z" });
    const c = classify(tokens, body);
    const extraction: Extraction = {
      message_id: "E-900-1",
      thread_id: "E-900",
      mode: "simulated",
      provider: "simulated",
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      email_class: c.email_class,
      signals: c.signals,
      invoice_refs: tokens.refs,
      amounts: tokens.amounts,
      dates: [],
      commitment_date: c.commitment_date,
      payment_claim: c.payment_claim,
      missing_info: c.missing_info,
      status: "valid",
    };
    const invoice: Invoice = {
      row_id: 1,
      invoice_id: "INV-042",
      invoice_number: "INV-1042",
      customer_id: "C-006",
      invoice_date: "2026-09-01",
      due_date: "2026-10-01",
      amount_paise: 34_000_000,
      currency: "INR",
      status_raw: "open",
      status: "open",
      billing_period: null,
      po_number: null,
    };
    const match: Match = {
      message_id: "E-900-1",
      outcome: "matched",
      customer_id: "C-006",
      invoice_id: "INV-042",
      candidates: ["INV-042"],
      reason: "r",
    };
    const [item] = reviewItemsFor(match, extraction, { invoices: [invoice], payments: [] });
    expect(item?.validation_status).toBe("conflict");
    expect(item?.email_amount_paise).toBe(30_000_000);
    expect(item?.ledger_outstanding_paise).toBe(34_000_000);
  });
});

// M-002 R16: "May" the month is neither a hedge nor, as a modal, a dispute object.
describe("classify — the month May (R16)", () => {
  it("a May-invoice duplicate is still a duplicate", () => {
    expect(run("The May invoice INV-2041 is a duplicate of INV-2038.").email_class).toBe("duplicate");
  });

  it("a payment on 3 May is still a confirmation dated to it", () => {
    const c = run("We have paid INV-2041 in full on 3 May.");
    expect(c.email_class).toBe("confirmation");
    expect(c.commitment_date).toBe("2026-05-03");
  });

  it("the modal 'may' is not a dispute object", () => {
    expect(run("We dispute this. You may call us.").email_class).not.toBe("dispute");
  });

  it("the month May is still a dispute object", () => {
    expect(run("We dispute the charges billed for May.").email_class).toBe("dispute");
  });
});

// M-002 R17 / EXE10: within one email, the latest commitment date wins.
describe("classify — latest commitment date (R17)", () => {
  it("two promised dates → the later one", () => {
    const c = run("We will pay part on 10/11 and will clear the balance by 20/11.");
    expect(c.email_class).toBe("commitment");
    expect(c.commitment_date).toBe("2026-11-20");
  });
});
