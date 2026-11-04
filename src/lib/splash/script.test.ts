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
  timers: { fn: () => void; delay: number; id: number }[];
  /** Calls the window's listeners for `type` the way a browser would (deduped by fn + capture). */
  dispatch(type: string, init?: Record<string, unknown>): FakeEvent;
  /** Runs pending timers (and any they schedule) until none are left. */
  flush(): void;
}

interface FakeEvent {
  type: string;
  key?: string;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopImmediatePropagation(): void;
  [k: string]: unknown;
}

function stubWindow(
  opts: { session?: string | null; search?: string; throwStorage?: boolean; clock?: { t: number } } = {},
): Stub {
  const attrs: Record<string, string> = {};
  const marks: string[] = [];
  const timers: Stub["timers"] = [];
  const listeners: { type: string; fn: (e: unknown) => void; capture: boolean }[] = [];
  let nextId = 0;
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
      nextId += 1;
      timers.push({ fn, delay, id: nextId });
      return nextId;
    },
    clearTimeout: (id: number) => {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    addEventListener: (type: string, fn: (e: unknown) => void, capture?: boolean) => {
      const c = !!capture;
      if (!listeners.some((l) => l.type === type && l.fn === fn && l.capture === c)) listeners.push({ type, fn, capture: c });
    },
    removeEventListener: (type: string, fn: (e: unknown) => void, capture?: boolean) => {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === !!capture);
      if (i >= 0) listeners.splice(i, 1);
    },
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
  const dispatch = (type: string, init: Record<string, unknown> = {}): FakeEvent => {
    const ev: FakeEvent = {
      type,
      defaultPrevented: false,
      stopped: false,
      preventDefault() {
        ev.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        ev.stopped = true;
      },
      ...init,
    };
    // Capture listeners first, in registration order; a stopped event reaches no more.
    for (const l of [...listeners.filter((x) => x.capture), ...listeners.filter((x) => !x.capture)]) {
      if (l.type !== type) continue;
      if (ev.stopped) break;
      l.fn(ev);
    }
    return ev;
  };
  const flush = () => {
    for (let i = 0; i < 50 && timers.length; i++) timers.splice(0).forEach((x) => x.fn());
  };
  return { attrs, marks, window, timers, dispatch, flush };
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

  // TASK-45.2 R-7 (ticket: "show() twice … idempotent").
  it("show() while the splash is live is a no-op; after done it replays", () => {
    const clock = { t: 0 };
    const stub = stubWindow({ session: "guest", clock });
    exec(prod, stub);
    const pending = stub.timers.length;
    stub.window.verilaneSplash?.show();
    expect(stub.marks.filter((x) => x === "splash:painted")).toHaveLength(1);
    expect(stub.timers).toHaveLength(pending);
    expect(stub.attrs["data-splash"]).toBe("on");
    clock.t = 300;
    stub.window.verilaneSplash?.skip();
    clock.t = 700;
    stub.flush();
    expect(stub.attrs["data-splash"]).toBe("done");
    stub.window.verilaneSplash?.show();
    expect(stub.attrs["data-splash"]).toBe("on");
    expect(stub.marks.filter((x) => x === "splash:painted")).toHaveLength(2);
  });

  describe("pointer skip swallows exactly the skipping press's click (R-2)", () => {
    function skipByPointer() {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", clock });
      exec(prod, stub);
      clock.t = 300;
      const down = stub.dispatch("pointerdown");
      expect(stub.attrs["data-splash"]).toBe("exit");
      expect(down.stopped).toBe(true);
      return { stub, clock };
    }

    it("after a long press, the release's click is still swallowed", () => {
      const { stub, clock } = skipByPointer();
      clock.t = 2300;
      stub.dispatch("pointerup");
      const click = stub.dispatch("click");
      expect(click.defaultPrevented).toBe(true);
      expect(click.stopped).toBe(true);
    });

    // Also proves stop() is idempotent: the stale D and ceiling timers call it again after done.
    it("the swallow outlives the overlay when the press outlasts the exit", () => {
      const { stub, clock } = skipByPointer();
      clock.t = 700;
      stub.flush();
      expect(stub.attrs["data-splash"]).toBe("done");
      clock.t = 12_000;
      stub.dispatch("pointerup");
      expect(stub.dispatch("click").defaultPrevented).toBe(true);
    });

    it("a new press ends the swallow, so its click reaches the app", () => {
      const { stub, clock } = skipByPointer();
      clock.t = 310;
      stub.dispatch("pointerup");
      clock.t = 400;
      stub.dispatch("pointerdown");
      clock.t = 410;
      stub.dispatch("pointerup");
      expect(stub.dispatch("click").defaultPrevented).toBe(false);
    });

    it("a cancelled press swallows nothing later", () => {
      const { stub, clock } = skipByPointer();
      clock.t = 350;
      stub.dispatch("pointercancel");
      clock.t = 400;
      expect(stub.dispatch("click").defaultPrevented).toBe(false);
    });

    it("only one click is swallowed", () => {
      const { stub, clock } = skipByPointer();
      clock.t = 310;
      stub.dispatch("pointerup");
      expect(stub.dispatch("click").defaultPrevented).toBe(true);
      expect(stub.dispatch("click").defaultPrevented).toBe(false);
    });
  });

  // R-4: a replay inside the old 600 ms deferred-removal window kept its click
  // listener only until the stale timer removed it.
  it("a replay right after done still swallows its own skipping click", () => {
    const clock = { t: 0 };
    const stub = stubWindow({ session: "guest", clock });
    exec(prod, stub);
    clock.t = 300;
    stub.dispatch("pointerdown");
    stub.dispatch("pointerup");
    stub.dispatch("click");
    clock.t = 700;
    // Run only the exit → done timer, so anything stop() defers is still pending.
    for (const x of stub.timers.filter((y) => y.delay === 300)) {
      stub.timers.splice(stub.timers.indexOf(x), 1);
      x.fn();
    }
    expect(stub.attrs["data-splash"]).toBe("done");
    const leftBehind = stub.timers.filter((x) => x.delay !== 5700 && x.delay !== 9700);
    stub.window.verilaneSplash?.show();
    expect(stub.attrs["data-splash"]).toBe("on");
    // Fire whatever stop() left behind; it must not unbind the new run.
    leftBehind.forEach((x) => x.fn());
    clock.t = 1100;
    stub.dispatch("pointerdown");
    expect(stub.attrs["data-splash"]).toBe("exit");
    stub.dispatch("pointerup");
    expect(stub.dispatch("click").defaultPrevented).toBe(true);
  });

  describe("the skipping key's default (R-3)", () => {
    function skipByKey(init: Record<string, unknown>) {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", clock });
      exec(prod, stub);
      clock.t = 300;
      const ev = stub.dispatch("keydown", init);
      return { stub, ev };
    }

    it.each([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"])(
      "prevents the scroll a skipping %j would cause",
      (key) => {
        const { stub, ev } = skipByKey({ key });
        expect(stub.attrs["data-splash"]).toBe("exit");
        expect(ev.stopped).toBe(true);
        expect(ev.defaultPrevented).toBe(true);
      },
    );

    it.each(["F5", "F11", "Escape", "Enter", "a"])("leaves the default of a skipping %j alone", (key) => {
      const { stub, ev } = skipByKey({ key });
      expect(stub.attrs["data-splash"]).toBe("exit");
      expect(ev.stopped).toBe(true);
      expect(ev.defaultPrevented).toBe(false);
    });

    it("a modified key neither skips nor is prevented", () => {
      const { stub, ev } = skipByKey({ key: "ArrowDown", ctrlKey: true });
      expect(stub.attrs["data-splash"]).toBe("on");
      expect(ev.defaultPrevented).toBe(false);
      expect(ev.stopped).toBe(false);
    });
  });

  it("swallows a throw from a broken window", () => {
    expect(() => vm.runInNewContext(prod, { window: {} })).not.toThrow();
  });
});
