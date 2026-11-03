import { describe, expect, it } from "vitest";

import { findTarget, type TargetRoot } from "./findTarget";

// The unit project runs in node (no DOM), so the root is a tiny fake that
// answers querySelectorAll with elements carrying a fixed rect.
type Fake = { sel: string; w: number; h: number };
function root(els: Fake[]): TargetRoot {
  return {
    querySelectorAll: (sel: string) =>
      els
        .filter((e) => e.sel === sel)
        .map((e) => ({ getBoundingClientRect: () => ({ width: e.w, height: e.h }) }) as unknown as HTMLElement),
  };
}

describe("findTarget", () => {
  it("returns null before the element exists, and the element once it is added", () => {
    const els: Fake[] = [];
    const r = root(els);
    expect(findTarget("[data-tour=queue-list]", undefined, r)).toBeNull();
    els.push({ sel: "[data-tour=queue-list]", w: 400, h: 300 });
    expect(findTarget("[data-tour=queue-list]", undefined, r)).not.toBeNull();
  });

  it("skips a hidden (zero-rect) match and returns the first visible one", () => {
    const els: Fake[] = [
      { sel: "a", w: 0, h: 0 },
      { sel: "a", w: 10, h: 10 },
    ];
    const hit = findTarget("a", undefined, root(els));
    expect(hit?.getBoundingClientRect().width).toBe(10);
  });

  it("returns the fallback when the primary match has a zero rect (hidden sidebar)", () => {
    const els: Fake[] = [
      { sel: "[data-tour=nav-settings]", w: 0, h: 0 },
      { sel: "[data-tour=nav-more]", w: 44, h: 44 },
    ];
    const hit = findTarget("[data-tour=nav-settings]", "[data-tour=nav-more]", root(els));
    expect(hit?.getBoundingClientRect().width).toBe(44);
  });

  it("returns null when neither the target nor the fallback is visible", () => {
    expect(findTarget("x", "y", root([{ sel: "x", w: 0, h: 0 }]))).toBeNull();
  });
});
