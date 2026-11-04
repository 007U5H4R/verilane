/**
 * TASK-45.2 · TC-127 (part 2): the inline head script is the stringified
 * runtime. These tests run the exact string in a fresh `node:vm` context
 * against a stub window, so a helper or import leaking out of
 * `splashRuntime()` fails here rather than in a browser.
 */
import vm from "node:vm";

import { describe, expect, it } from "vitest";

import { buildSplashScript, splashConfig } from "./runtime";

interface Stub {
  attrs: Record<string, string>;
  marks: string[];
  window: Record<string, unknown> & { verilaneSplash?: { state(): string; skip(): void; show(): void } };
  /** Pending setTimeout callbacks, with the delay each was scheduled for. */
  timers: { fn: () => void; delay: number }[];
}

function stubWindow(
  opts: { session?: string | null; search?: string; throwStorage?: boolean; clock?: { t: number } } = {},
): Stub {
  const attrs: Record<string, string> = {};
  const marks: string[] = [];
  const timers: Stub["timers"] = [];
  let t = 0;
  const store = (init: Record<string, string>) => {
    const data = { ...init };
    return {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    };
  };
  const local = store(opts.session ? { "verilane-session": opts.session } : {});
  const tab = store({});
  const documentElement = {
    setAttribute: (k: string, v: string) => {
      attrs[k] = v;
    },
    getAttribute: (k: string) => attrs[k] ?? null,
  };
  const window: Stub["window"] = {
    document: {
      documentElement,
      getElementById: () => null,
      addEventListener: () => {},
      activeElement: null,
    },
    performance: {
      now: () => (opts.clock ? opts.clock.t : (t += 1)),
      mark: (n: string) => {
        marks.push(n);
      },
    },
    console: { warn: () => {} },
    setTimeout: (fn: () => void, delay: number) => {
      timers.push({ fn, delay });
      return timers.length;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { search: opts.search ?? "", pathname: "/" },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  Object.defineProperty(window, "localStorage", {
    get: () => {
      if (opts.throwStorage) throw new Error("SecurityError");
      return local;
    },
  });
  Object.defineProperty(window, "sessionStorage", { get: () => tab });
  return { attrs, marks, window, timers };
}

function exec(src: string, stub: Stub) {
  vm.runInNewContext(src, { window: stub.window, URLSearchParams });
}

describe("buildSplashScript", () => {
  const prod = buildSplashScript(splashConfig(false));
  const e2e = buildSplashScript(splashConfig(true));

  it("is self-contained: no module loader or dynamic import", () => {
    for (const src of [prod, e2e]) {
      expect(src).not.toMatch(/require\(/);
      expect(src).not.toMatch(/__webpack/);
      expect(src).not.toMatch(/import\(/);
      expect(src).not.toMatch(/__turbopack/);
    }
  });

  it("never carries the e2e force hook outside the e2e build", () => {
    expect(prod).not.toContain("__splash");
    expect(e2e).toContain("__splash");
  });

  it("turns the splash on for a guest and installs window.verilaneSplash", () => {
    const stub = stubWindow({ session: "guest" });
    exec(prod, stub);
    expect(stub.attrs["data-splash"]).toBe("on");
    expect(stub.marks).toContain("splash:painted");
    expect(stub.window.verilaneSplash?.state()).toBe("on");
    stub.window.verilaneSplash?.skip();
    expect(stub.attrs["data-splash"]).toBe("exit");
    expect(stub.marks).toEqual(expect.arrayContaining(["splash:skip", "splash:exit"]));
  });

  it("stays off without a session, but still installs the API", () => {
    const stub = stubWindow({ session: null });
    exec(prod, stub);
    expect(stub.attrs["data-splash"]).toBeUndefined();
    expect(stub.window.verilaneSplash?.state()).toBe("off");
  });

  it("stays off and does not throw when storage is blocked", () => {
    const stub = stubWindow({ session: "guest", throwStorage: true });
    expect(() => exec(prod, stub)).not.toThrow();
    expect(stub.attrs["data-splash"]).toBeUndefined();
  });

  it("in the e2e build is off by default and on with ?__splash=1", () => {
    const off = stubWindow({ session: "guest" });
    exec(e2e, off);
    expect(off.attrs["data-splash"]).toBeUndefined();
    const on = stubWindow({ search: "?__splash=1" });
    exec(e2e, on);
    expect(on.attrs["data-splash"]).toBe("on");
  });

  // Browsers may run a timer a fraction of a millisecond before
  // performance.now() reaches its deadline. Found by TC-134: the ceiling tick
  // arrived at 9699.x, nothing transitioned, and the overlay never left.
  it("treats a timer that fires slightly early as having reached its deadline", () => {
    const clock = { t: 0 };
    const stub = stubWindow({ session: "guest", clock });
    exec(prod, stub);
    const fire = (deadline: number) => {
      clock.t = deadline - 0.5;
      stub.timers.filter((x) => x.delay === deadline).forEach((x) => x.fn());
    };
    fire(5700);
    expect(stub.attrs["data-splash"]).toBe("hold");
    fire(9700);
    expect(stub.attrs["data-splash"]).toBe("exit");
    expect(stub.marks).toContain("splash:ceiling");
  });

  it("swallows a throw from a broken window", () => {
    expect(() => vm.runInNewContext(prod, { window: {} })).not.toThrow();
  });
});
