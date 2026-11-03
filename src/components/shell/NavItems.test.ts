import { describe, expect, expectTypeOf, it } from "vitest";
import { NAV_ITEMS, type NavItem } from "./NavItems";

// TASK-33: nav counts must come from live data, never a hard-coded number.
describe("NAV_ITEMS counts", () => {
  it("has no static count field", () => {
    expectTypeOf<NavItem>().not.toHaveProperty("count");
    for (const item of NAV_ITEMS) expect(item).not.toHaveProperty("count");
  });

  it("Queue, Disputes and Drafts use their live counts", () => {
    const byHref = Object.fromEntries(NAV_ITEMS.map((i) => [i.href, i]));
    expect(byHref["/queue"]?.liveCount).toBe(true);
    expect(byHref["/disputes"]?.disputeCount).toBe(true);
    expect(byHref["/drafts"]?.draftCount).toBe(true);
  });
});

// TASK-38 (Design.md R2): nav order, with Audit Log and Settings below the divider.
describe("NAV_ITEMS order", () => {
  it("lists the R2 sections in order", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Home",
      "Queue",
      "Disputes",
      "Email Conversations",
      "Invoices",
      "Drafts",
      "Payments",
      "Audit Log",
      "Settings",
    ]);
  });

  it("marks only Audit Log and Settings as secondary, and they come last", () => {
    expect(NAV_ITEMS.filter((i) => i.secondary).map((i) => i.href)).toEqual(["/audit", "/settings"]);
    const firstSecondary = NAV_ITEMS.findIndex((i) => i.secondary);
    expect(NAV_ITEMS.slice(firstSecondary).every((i) => i.secondary)).toBe(true);
  });
});
