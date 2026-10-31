import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import { extractTokens } from "./extract";

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
