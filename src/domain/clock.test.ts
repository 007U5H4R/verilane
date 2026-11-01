import { describe, expect, it } from "vitest";
import { AS_OF_DATE, asOf, daysBetween, formatDate, formatDateTime, toDay } from "./clock";

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

// R7: dates render in one fixed locale (en-IN) and zone (Asia/Kolkata),
// whatever the viewer's machine is set to.
describe("formatDate", () => {
  it("renders an ISO day as day, short month, year", () => {
    expect(formatDate("2026-10-30")).toBe("30 Oct 2026");
  });

  it("keeps the calendar day of a date-only ISO string", () => {
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("returns an em dash for an invalid date", () => {
    expect(formatDate("")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("renders an instant in Asia/Kolkata", () => {
    expect(formatDateTime("2026-10-30T10:05:00Z")).toBe("30 Oct 2026, 03:35 pm");
  });

  it("returns an em dash for an invalid instant", () => {
    expect(formatDateTime("not a date")).toBe("—");
  });
});
