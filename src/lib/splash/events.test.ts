/** TASK-45.2: phase hooks are one-line, never-throwing CustomEvent emitters. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { emitSplash } from "./events";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("emitSplash", () => {
  it("dispatches verilane:splash with the phase", () => {
    const seen: unknown[] = [];
    const target = new EventTarget();
    target.addEventListener("verilane:splash", (e) => seen.push((e as CustomEvent).detail.phase));
    vi.stubGlobal("window", target);
    emitSplash("session");
    emitSplash("ready");
    expect(seen).toEqual(["session", "ready"]);
  });

  it("marks splash:ready on ready, splash or not", () => {
    vi.stubGlobal("window", new EventTarget());
    const mark = vi.spyOn(performance, "mark");
    emitSplash("ready");
    expect(mark).toHaveBeenCalledWith("splash:ready");
    mark.mockRestore();
  });

  it("never throws, even without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(() => emitSplash("provider")).not.toThrow();
  });
});
