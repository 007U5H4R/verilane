import { describe, expect, it } from "vitest";
import { formatInr, formatInrWhole, paise, parseInr } from "./money";

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
