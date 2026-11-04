import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HERITAGE_ENABLED,
  HERITAGE_LEVELS,
  heritageLevelFor,
  isHeritageHome,
  scheduleIdleOnce,
  type HeritageLevel,
  type IdleHost,
} from "./heritage";

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

// TASK-46.4 · Idle preload of the other theme (F4). The host is injected, so
// these run on vitest's fake timers in the node `unit` project (TP10).
type Fn = () => void;

/** A host without requestIdleCallback (Safari): only the timer fallback. */
function timerHost(extra: Partial<IdleHost> = {}) {
  const host = {
    setTimeout: vi.fn((cb: Fn, ms: number) => setTimeout(cb, ms) as unknown as number),
    clearTimeout: vi.fn((id: number) => clearTimeout(id)),
    ...extra,
  };
  return host satisfies IdleHost;
}

/** A host with requestIdleCallback, modelled as "idle after 50 ms". */
function idleHost(extra: Partial<IdleHost> = {}) {
  return timerHost({
    requestIdleCallback: vi.fn((cb: Fn) => setTimeout(cb, 50) as unknown as number),
    cancelIdleCallback: vi.fn((id: number) => clearTimeout(id)),
    ...extra,
  });
}

describe("scheduleIdleOnce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("TC-106a: uses requestIdleCallback once with {timeout: 4000}; cb runs once", () => {
    const host = idleHost();
    const cb = vi.fn();
    scheduleIdleOnce(host, cb);
    expect(host.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(host.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 4000 });
    expect(host.setTimeout).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("TC-106a: falls back to setTimeout(…, 2500) without requestIdleCallback; cb runs once", () => {
    const host = timerHost();
    const cb = vi.fn();
    scheduleIdleOnce(host, cb);
    expect(host.setTimeout).toHaveBeenCalledTimes(1);
    expect(host.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2500);
    vi.advanceTimersByTime(2499);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("TC-106a: a host that fires the callback twice still runs cb once", () => {
    const host = idleHost({
      requestIdleCallback: vi.fn((cb: Fn) => {
        setTimeout(cb, 10);
        return setTimeout(cb, 20) as unknown as number;
      }),
    });
    const cb = vi.fn();
    scheduleIdleOnce(host, cb);
    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["requestIdleCallback", idleHost],
    ["setTimeout", timerHost],
  ] as const)("TC-107a: saveData schedules nothing (%s host)", (_name, make) => {
    const host = make({ navigator: { connection: { saveData: true } } });
    const cb = vi.fn();
    const cancel = scheduleIdleOnce(host, cb);
    expect(host.setTimeout).not.toHaveBeenCalled();
    if ("requestIdleCallback" in host) expect(host.requestIdleCallback).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(cb).not.toHaveBeenCalled();
    expect(() => cancel()).not.toThrow();
  });

  it("TC-107a: saveData false or no connection info still schedules", () => {
    for (const navigator of [{ connection: { saveData: false } }, { connection: {} }, {}]) {
      const host = timerHost({ navigator });
      const cb = vi.fn();
      scheduleIdleOnce(host, cb);
      vi.runAllTimers();
      expect(cb, JSON.stringify(navigator)).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ["requestIdleCallback", idleHost],
    ["setTimeout", timerHost],
  ] as const)("TC-108: cancel before fire means cb never runs; double cancel does not throw (%s host)", (_name, make) => {
    const host = make();
    const cb = vi.fn();
    const cancel = scheduleIdleOnce(host, cb);
    cancel();
    vi.runAllTimers();
    expect(() => cancel()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
    if ("cancelIdleCallback" in host) expect(host.cancelIdleCallback).toHaveBeenCalledTimes(1);
    else expect(host.clearTimeout).toHaveBeenCalledTimes(1);
  });

  it("TC-108: cancel after the callback ran is a no-op", () => {
    const host = idleHost();
    const cb = vi.fn();
    const cancel = scheduleIdleOnce(host, cb);
    vi.runAllTimers();
    expect(() => cancel()).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(host.cancelIdleCallback).not.toHaveBeenCalled();
  });
});
