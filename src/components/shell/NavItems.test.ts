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
