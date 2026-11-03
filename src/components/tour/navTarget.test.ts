import { describe, expect, it } from "vitest";

import { navTourId } from "./navTarget";
import { TOUR_STEPS } from "./steps";

describe("navTourId", () => {
  it("tags the three nav links the tour points at", () => {
    expect(navTourId("/queue")).toBe("nav-queue");
    expect(navTourId("/settings")).toBe("nav-settings");
    expect(navTourId("/audit")).toBe("nav-audit");
  });

  it("leaves every other link untagged", () => {
    expect(navTourId("/")).toBeUndefined();
    expect(navTourId("/drafts")).toBeUndefined();
  });

  it("covers every desktop nav hint the steps use", () => {
    const hints = TOUR_STEPS.flatMap((s) => s.stages.map((st) => st.navHint?.target)).filter((t): t is string => !!t);
    const tagged = ["/queue", "/settings", "/audit"].map((h) => `[data-tour=${navTourId(h)}]`);
    for (const t of hints) expect(tagged).toContain(t);
  });
});
