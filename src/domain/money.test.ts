import { describe, expect, expectTypeOf, it } from "vitest";
import { formatInr, formatInrWhole, paise, parseInr, type Paise } from "./money";
import { outstandingOf } from "./priority";
import { PaymentSchema, type Invoice } from "./schema";

// TC-007: money parsing and formatting.
describe("paise", () => {
  it("accepts an integer", () => {
    expect(paise(34_000_000)).toBe(34_000_000);
  });

  it("throws on a non-integer", () => {
    expect(() => paise(1.5)).toThrow();
  });
});

describe("parseInr", () => {
  it("parses a ₹-prefixed, Indian-grouped amount", () => {
    // ₹3,40,000 => 340000 rupees => 34_000_000 paise.
    expect(parseInr("₹3,40,000")).toBe(34_000_000);
  });

  it("parses an 'Rs.' prefix with Western grouping", () => {
    expect(parseInr("Rs. 340000")).toBe(34_000_000);
  });

  it("parses an 'INR' prefix with a lakh suffix", () => {
    expect(parseInr("INR 3.4 lakh")).toBe(34_000_000);
  });

  it("parses a plural 'lakhs' suffix with no currency prefix", () => {
    expect(parseInr("3.4 lakhs")).toBe(34_000_000);
  });

  it("parses a crore suffix", () => {
    // 1.2 crore => 12,000,000 rupees => 1,200,000,000 paise.
    expect(parseInr("1.2 crore")).toBe(1_200_000_000);
  });

  it("parses fractional (paise) amounts with Western grouping", () => {
    expect(parseInr("340,000.50")).toBe(34_000_050);
  });

  it("returns null for non-numeric input", () => {
    expect(parseInr("abc")).toBeNull();
  });

  it("returns null for a negative amount", () => {
    expect(parseInr("₹-5")).toBeNull();
  });

  // CR-004: no float rounding — an amount that isn't a whole number of paise
  // is rejected rather than silently rounded.
  it("returns null for a rupee amount with sub-paise precision", () => {
    expect(parseInr("1.005")).toBeNull();
    expect(parseInr("₹10.999")).toBeNull();
  });

  it("parses sub-rupee lakh amounts exactly with integer arithmetic", () => {
    expect(parseInr("1.23456 lakh")).toBe(12_345_600);
    expect(parseInr("0.29")).toBe(29);
  });

  it("returns null for an amount beyond the safe-integer paise range", () => {
    expect(parseInr("99999999999999999")).toBeNull();
  });
});

describe("formatInr", () => {
  it("formats paise as Indian-grouped rupees with 2 decimals", () => {
    expect(formatInr(paise(34_000_000))).toBe("₹3,40,000.00");
  });
});

// R7: one place for whole-rupee formatting (was priority.ts's private helper).
describe("formatInrWhole", () => {
  it("formats whole rupees with Indian grouping and no decimals", () => {
    expect(formatInrWhole(paise(34_000_000))).toBe("₹3,40,000");
  });

  it("rounds to the nearest rupee", () => {
    expect(formatInrWhole(paise(12_350))).toBe("₹124");
  });
});

// R8 (TASK-33): amounts are branded `Paise` at the Zod schema boundary, so a
// raw number can't stand in for a ledger amount and `outstandingOf` stays Paise.
describe("Paise brand at the schema boundary", () => {
  it("parsed invoice/payment amounts are Paise; raw numbers are not", () => {
    const pay = PaymentSchema.parse({
      payment_id: "P-1",
      invoice_id: "INV-1",
      paid_on: "2026-10-01",
      amount_paise: 1_000,
    });
    expectTypeOf(pay.amount_paise).toEqualTypeOf<Paise>();
    expectTypeOf<Invoice["amount_paise"]>().toEqualTypeOf<Paise>();
    expectTypeOf(outstandingOf).returns.toEqualTypeOf<Paise>();
    // @ts-expect-error a bare number is not Paise
    const raw: Paise = 1_000;
    expect(raw).toBe(1_000);
    expect(() => PaymentSchema.parse({ ...pay, amount_paise: 1.5 })).toThrow();
  });
});
