/**
 * TASK-30: general dispute and payment-confirmation language.
 *
 * Every phrasing here is invented for this file (not taken from any eval set)
 * and varies the wording a customer might use, so the rules are tested on
 * cue-word families, negation scope and precedence rather than on the seed's
 * exact sentences. Negatives and near-misses sit next to the positives.
 */
import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import { extractTokens } from "./extract";
import type { DisputeType } from "./schema";

function run(body: string, sent_at = "2026-10-28T09:00:00Z") {
  return classify(extractTokens({ body, sent_at }), body);
}

describe("dispute — general phrasings (TASK-30)", () => {
  it.each<[string, DisputeType]>([
    // quantity / price / quality
    ["The rate charged on INV-2101 is higher than the agreed ₹450 per unit.", "incorrect_amount"],
    ["INV-2102 shows 120 cartons but only 100 cartons were delivered to our site.", "incorrect_amount"],
    ["We received a short delivery against INV-2103, so the quantity billed is wrong.", "incorrect_amount"],
    ["Pricing on INV-2104 is not as per the quotation you shared in August.", "incorrect_amount"],
    ["Kindly note we were charged extra freight on INV-2124 that was never agreed.", "incorrect_amount"],
    ["We have been overcharged on INV-2125 by ₹8,500.", "incorrect_amount"],
    ["The quantity invoiced on INV-2126 doesn't tally with our goods receipt note.", "incorrect_amount"],
    ["There is a price difference of ₹14,000 between INV-2161 and our purchase order.", "incorrect_amount"],
    // goods not received or damaged
    ["Half of the tiles supplied under INV-2105 arrived broken.", "not_received"],
    ["The pumps billed on INV-2106 are defective and we are returning them.", "not_received"],
    ["We have not yet received the material against INV-2107.", "not_received"],
    ["The services billed in INV-2108 were never rendered.", "not_received"],
    ["We never received the consignment billed on INV-2109.", "not_received"],
    ["We are still awaiting delivery of the items invoiced in INV-2110.", "not_received"],
    // never ordered / PO mismatch
    ["We never placed an order for the items on INV-2111.", "missing_po"],
    ["The PO number on INV-2112 does not match our purchase order.", "missing_po"],
    ["INV-2113 quotes a wrong PO reference.", "missing_po"],
    ["These items were not ordered by us; please cancel INV-2162.", "missing_po"],
    // specific type wins over a generic dispute word
    ["We dispute INV-2159 because the rate is wrong.", "incorrect_amount"],
  ])("%s → %s", (text, type) => {
    const c = run(text);
    expect(c.email_class).toBe("dispute");
    expect(c.dispute_type).toBe(type);
  });

  it.each([
    // credit notes, withholding, escalation
    "Please issue a credit note for ₹12,000 against INV-2114.",
    "We are withholding payment of INV-2115 until the discrepancy is resolved.",
    "Payment for INV-2116 is on hold pending clarification on the freight charges.",
    "We will not release payment for INV-2117 until we receive a corrected invoice.",
    "If this is not sorted out by Friday, we will have to escalate INV-2118 to our CFO.",
    "This is our third reminder about the errors in INV-2119; we are escalating the matter.",
    // polite and indirect
    "There seems to be an error in the invoice INV-2120, kindly check.",
    "We noticed a discrepancy in the GST charged on INV-2121.",
    "With respect, we are unable to accept INV-2122 at this value.",
    "INV-2123 appears to have been raised in error.",
    "INV-2127 is incorrect — the rate should be ₹200, not ₹250.",
    "We object to the late-payment interest added to INV-2128.",
    "Could you please send us a revised invoice for INV-2163?",
  ])("%s → dispute", (text) => {
    expect(run(text).email_class).toBe("dispute");
  });

  it("a mixed email: part paid, rest held for damaged goods → dispute, confirmation kept", () => {
    const c = run(
      "We have paid ₹40,000 against INV-2158, but the balance is on hold until you issue a credit note for the damaged boxes.",
    );
    expect(c.email_class).toBe("dispute");
    expect(c.dispute_type).toBe("not_received");
    expect(c.signals).toContain("confirmation");
  });
});

describe("dispute — negations and near-misses (TASK-30)", () => {
  it.each([
    "We don't dispute INV-2129; payment will follow shortly.",
    "Please let us know if there is any error in INV-2131.",
    "The goods for INV-2133 arrived in good condition, thank you.",
    "We have received the material against INV-2134 and the quality is fine.",
    "Payment for INV-2136 is on hold as our quarterly budget is pending approval.",
    "In case the consignment for INV-2137 arrives damaged, we will inform you.",
    "Please escalate INV-2165 to your accounts team so we get a copy.",
    "No goods were damaged in transit for INV-2166.",
    "We have not received the invoice copy for INV-2164 yet.",
  ])("%s → not a dispute", (text) => {
    expect(run(text).email_class).not.toBe("dispute");
  });

  it("'no discrepancy … we will pay' is a commitment", () => {
    expect(run("There is no discrepancy in INV-2130 and we will pay it on 12 Nov 2026.").email_class).toBe(
      "commitment",
    );
  });

  it("'not disputing, need more time' is a delay", () => {
    expect(run("We are not disputing the amount on INV-2132, we only need a few more weeks.").email_class).toBe(
      "delay",
    );
  });

  it("asking for an existing credit note is an enquiry", () => {
    expect(run("Could you send us the credit note you issued for INV-2135 last month?").email_class).toBe("enquiry");
  });

  it("'not withholding … will be released' is a commitment", () => {
    expect(run("We are not withholding payment for INV-2155; it will be released on 5 Nov 2026.").email_class).toBe(
      "commitment",
    );
  });

  it("a resolved discrepancy plus a promise is a commitment", () => {
    expect(
      run("The discrepancy in INV-2160 has been resolved and we will pay on 7 Nov 2026.").email_class,
    ).toBe("commitment");
  });
});

describe("confirmation — general phrasings (TASK-30)", () => {
  it.each([
    "We have remitted ₹2,45,000 towards INV-2140 today.",
    "Funds for INV-2141 were transferred via RTGS on 26/10/2026.",
    "Please find attached the remittance advice for ₹88,000 against INV-2142.",
    "Payment of ₹56,000 for INV-2143 has now been credited to your account.",
    "IMPS transfer done for INV-2144, ref no. 629912345678.",
    "NEFT UTR: SBIN226301234567 for INV-2145 dated 27 Oct 2026.",
    "We've cleared INV-2146 in full.",
    "Settled INV-2147 yesterday via NEFT.",
    "The amount of ₹1,05,000 against INV-2148 was successfully transferred this morning.",
    "We paid INV-2156 after deducting TDS of ₹2,000.",
    "We have paid INV-2157 in full; there is no dispute from our side.",
    "Amount transferred to your account for INV-2167.",
  ])("%s → confirmation", (text) => {
    expect(run(text).email_class).toBe("confirmation");
  });

  it("a UTR number alone supports a confirmation (no amount, no invoice ref)", () => {
    const c = run("Paid via NEFT, UTR HDFC0026301122.");
    expect(c.email_class).toBe("confirmation");
    expect(c.payment_claim).toEqual({ paid_on: null, amount_paise: null });
  });
});

describe("confirmation — future, negated and requested (TASK-30)", () => {
  it("'will transfer' with a date is a commitment, not a confirmation", () => {
    expect(run("We will transfer ₹75,000 for INV-2150 on 4 Nov 2026.").email_class).toBe("commitment");
  });

  it("'we will pay' is a commitment", () => {
    expect(run("We will pay ₹1,20,000 against INV-2138 on 6 Nov 2026.").email_class).toBe("commitment");
  });

  it.each([
    "Once the payment for INV-2151 is made, we will share the UTR.",
    "We have not yet transferred the amount for INV-2152.",
    "Payment for INV-2153 is being processed and should reach you soon.",
    "Could you share the UTR for the payment you received against INV-2154?",
    "Please send the remittance advice for INV-2139.",
    "We are going to pay via NEFT after the 5th.",
  ])("%s → not a confirmation", (text) => {
    expect(run(text).email_class).not.toBe("confirmation");
  });
});
