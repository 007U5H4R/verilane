import { describe, expect, it } from "vitest";
import { AS_OF_DATE, asOf, daysBetween, toDay } from "./clock";

describe("AS_OF_DATE", () => {
  it("is the demo's frozen date", () => {
    expect(AS_OF_DATE).toBe("2026-10-30");
  });
});

describe("toDay", () => {
  it("is stable for the same calendar date", () => {
    expect(toDay("2026-10-30")).toBe(toDay("2026-10-30T00:00:00.000Z"));
  });

  it("increases by 1 for the next calendar day", () => {
    expect(toDay("2026-10-31") - toDay("2026-10-30")).toBe(1);
  });
});

describe("daysBetween", () => {
  it("returns a positive count when b is after a", () => {
    expect(daysBetween("2026-10-01", "2026-10-30")).toBe(29);
  });

  it("returns a negative count when b is before a", () => {
    expect(daysBetween("2026-10-30", "2026-10-01")).toBe(-29);
  });

  it("is zero for the same date", () => {
    expect(daysBetween("2026-10-30", "2026-10-30")).toBe(0);
  });
});

describe("asOf", () => {
  it("defaults to AS_OF_DATE", () => {
    expect(asOf()).toBe(AS_OF_DATE);
  });

  it("honors an injected override (for tests/E2E)", () => {
    expect(asOf({ asOf: "2026-11-15" })).toBe("2026-11-15");
  });
});
