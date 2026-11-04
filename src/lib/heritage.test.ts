import { describe, expect, it } from "vitest";

import { HERITAGE_ENABLED, HERITAGE_LEVELS, heritageLevelFor, isHeritageHome, type HeritageLevel } from "./heritage";

// TASK-46.3 · Solution-PRD-TASK-46 §4: one table, exact levels per route.
// Detail routes and /settings/eval are `reduced`: the 46.2.10 exposure at
// 1440×900 (whole / top 40% / column) is 0.25/0.39/0.31 (/invoices/[id]),
// 0.23/0.40/0.29 (/disputes/[id]) and 0.53/0.61/0.65 (/settings/eval).
const TABLE: [string, HeritageLevel][] = [
  ["/", "normal"],
  ["/queue", "normal"],
  ["/disputes", "normal"],
  ["/invoices", "normal"],
  ["/payments", "normal"],
  ["/emails", "reduced"],
  ["/settings", "reduced"],
  ["/drafts", "reduced"],
  ["/audit", "reduced"],
  ["/invoices/INV-1042", "reduced"],
  ["/disputes/DSP-7", "reduced"],
  ["/settings/eval", "reduced"],
  ["/e2e-harness", "off"],
];

describe("heritageLevelFor (TC-099)", () => {
  it.each(TABLE)("%s → %s", (path, level) => {
    expect(heritageLevelFor(path)).toBe(level);
  });

  it.each(TABLE.filter(([p]) => p !== "/"))("%s/ (trailing slash) keeps its level", (path, level) => {
    expect(heritageLevelFor(`${path}/`)).toBe(level);
  });

  it.each(TABLE)("%s?q=1#h ignores the query and hash", (path, level) => {
    expect(heritageLevelFor(`${path}?q=1#h`)).toBe(level);
    expect(heritageLevelFor(`${path}#h`)).toBe(level);
  });

  it("the table names the detail routes explicitly, not only via the default", () => {
    expect(HERITAGE_LEVELS).toMatchObject({
      "/invoices/[id]": "reduced",
      "/disputes/[id]": "reduced",
      "/settings/eval": "reduced",
    });
  });

  it("a nested path under a list route is not that route's level", () => {
    expect(heritageLevelFor("/queue/extra")).toBe("reduced");
    expect(heritageLevelFor("/invoices/INV-1/edit")).toBe("reduced");
  });
});

describe("unmapped routes (TC-100)", () => {
  // R-9: near-miss names are not their neighbours (no prefix matching).
  it.each(["/something-new", "/a/b/c", "", "/invoicesX", "/queue-archive", "/settingsx"])("%j → reduced", (path) => {
    expect(heritageLevelFor(path)).toBe("reduced");
  });
});

describe("switch-off (TC-103a, SC9)", () => {
  // Tripwire (R-7): the SC9 switch-off is HERITAGE_ENABLED = false in heritage.ts
  // AND flipping this expectation. If you are here because this failed, that is
  // the point: confirm the switch-off is intended, then update both together.
  it("ships enabled", () => {
    expect(HERITAGE_ENABLED).toBe(true);
  });

  it.each([...TABLE.map(([p]) => p), "/something-new"])("%s → off when disabled", (path) => {
    expect(heritageLevelFor(path, false)).toBe("off");
  });
});

describe("isHeritageHome (R-8)", () => {
  it.each(["/", "/?q=1", "/#h"])("%s is Home", (path) => {
    expect(isHeritageHome(path)).toBe(true);
  });

  it.each(["/queue", "/invoices/INV-1", ""])("%j is not Home", (path) => {
    expect(isHeritageHome(path)).toBe(false);
  });
});
