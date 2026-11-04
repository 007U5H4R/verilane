/** TASK-45.2: phase hooks are one-line, never-throwing CustomEvent emitters. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { emitSplash, resetSplash, showSplash } from "./events";

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

// TASK-45.3 · 45.3.3: the client entry asks the runtime to re-decide.
describe("showSplash", () => {
  it("calls the runtime's show()", () => {
    const show = vi.fn();
    vi.stubGlobal("window", { verilaneSplash: { show } });
    showSplash();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("never throws: no runtime, no window, or a throwing show()", () => {
    vi.stubGlobal("window", {});
    expect(() => showSplash()).not.toThrow();
    vi.stubGlobal("window", undefined);
    expect(() => showSplash()).not.toThrow();
    vi.stubGlobal("window", {
      verilaneSplash: {
        show: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => showSplash()).not.toThrow();
  });
});

// Review R-3: a GatedApp unmount ends its mount's phase log.
describe("resetSplash", () => {
  it("calls the runtime's reset()", () => {
    const reset = vi.fn();
    vi.stubGlobal("window", { verilaneSplash: { reset } });
    resetSplash();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("never throws: no runtime, an older runtime without reset(), no window, or a throwing reset()", () => {
    vi.stubGlobal("window", {});
    expect(() => resetSplash()).not.toThrow();
    vi.stubGlobal("window", { verilaneSplash: { show: () => {} } });
    expect(() => resetSplash()).not.toThrow();
    vi.stubGlobal("window", undefined);
    expect(() => resetSplash()).not.toThrow();
    vi.stubGlobal("window", {
      verilaneSplash: {
        reset: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => resetSplash()).not.toThrow();
  });
});
