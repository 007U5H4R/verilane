import { describe, expect, it } from "vitest";
import { detectSignals, PHRASE_FAMILIES, type SignalFamily } from "./phrases";

function families(text: string): SignalFamily[] {
  return detectSignals(text).map((h) => h.family);
}

describe("PHRASE_FAMILIES", () => {
  it("defines patterns, negations and hedges for every family", () => {
    expect(Object.keys(PHRASE_FAMILIES).sort()).toEqual(
      ["commitment", "confirmation", "delay", "dispute", "duplicate", "enquiry", "missing_info"].sort(),
    );
    for (const family of Object.values(PHRASE_FAMILIES)) {
      expect(family.patterns.length).toBeGreaterThan(0);
      expect(Array.isArray(family.negations)).toBe(true);
      expect(Array.isArray(family.hedges)).toBe(true);
    }
  });
});

// TC-022: negated or hedged phrases fire no confirmation / commitment / dispute signal.
describe("detectSignals — negation and hedging (TC-022)", () => {
  const BLOCKED: SignalFamily[] = ["confirmation", "commitment", "dispute"];

  it.each([
    "we have not paid",
    "We have not paid INV-1042 yet.",
    "we might pay by Friday",
    "We may be able to pay ₹50,000 next week if approvals come through.",
    "no dispute from our side",
    "There is no dispute on INV-1042.",
    "We have paid neither while this is open.",
    "We will not process payment until then.",
  ])("%s", (text) => {
    const fired = families(text);
    for (const f of BLOCKED) expect(fired).not.toContain(f);
  });
});

describe("detectSignals — positive phrases", () => {
  it.each<[string, SignalFamily]>([
    ["We have paid ₹3,00,000 against INV-1042.", "confirmation"],
    ["INV-1033 was paid on 24 Oct 2026.", "confirmation"],
    ["Payment for INV-1035 has been processed today.", "confirmation"],
    ["We will pay INV-1031 next Monday.", "commitment"],
    ["Payment will be made on or before 15/11/2026.", "commitment"],
    ["Payment date is 2026-11-12.", "commitment"],
    ["INV-1020 looks like a duplicate of INV-1019.", "duplicate"],
    ["We have been billed twice for the same order.", "duplicate"],
    ["The amount is incorrect; please revise.", "dispute"],
    ["Please correct the billing period.", "dispute"],
    ["INV-1037 does not quote our purchase order number.", "dispute"],
    ["The consignment never reached our warehouse.", "dispute"],
    ["Please stop the reminders for INV-1039.", "dispute"],
    ["INV-1040 will be delayed.", "delay"],
    ["Could you send a copy of INV-1041?", "enquiry"],
    ["We cannot process INV-1043 until you share your GSTIN.", "missing_info"],
  ])("%s → %s", (text, family) => {
    expect(families(text)).toContain(family);
  });

  it("tags each dispute hit with its dispute_type", () => {
    const type = (t: string) => detectSignals(t).find((h) => h.family === "dispute")?.dispute_type;
    expect(type("The amount is incorrect.")).toBe("incorrect_amount");
    expect(type("Please correct the billing period.")).toBe("incorrect_billing_period");
    expect(type("We cannot book an invoice without a PO.")).toBe("missing_po");
    expect(type("We have not received the goods.")).toBe("not_received");
    expect(type("We already settled it on 12 Sep 2026.")).toBe("payment_already_completed");
    expect(type("We dispute INV-1042.")).toBe("unknown");
  });

  it("does not read a self-negating dispute phrase as negated", () => {
    expect(families("We have not received the goods.")).toContain("dispute");
  });

  it("collects missing-info items", () => {
    const hit = detectSignals(
      "We cannot process INV-1043 until you share your GSTIN and the delivery challan number.",
    ).find((h) => h.family === "missing_info");
    expect(hit?.items).toEqual(["GSTIN", "delivery challan number"]);
  });

  it("fires nothing on a vague follow-up", () => {
    expect(families("Following up on our call last week about the pending items.")).toEqual([]);
  });
});
