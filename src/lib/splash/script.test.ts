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
  window: Record<string, unknown> & { verilaneSplash?: { state(): string; skip(): void; show(): void; reset(): void } };
  /** Pending setTimeout callbacks, with the delay each was scheduled for. */
  timers: { fn: () => void; delay: number; id: number; due: number }[];
  /** Calls the window's listeners for `type` the way a browser would (deduped by fn + capture). */
  dispatch(type: string, init?: Record<string, unknown>): FakeEvent;
  /** Runs pending timers (and any they schedule) until none are left. */
  flush(): void;
  local: KV;
  tab: KV;
  location: { search: string; pathname: string };
  /** The server-rendered overlay and the app wrapper (TASK-45.3). */
  overlay: FakeEl;
  app: FakeEl;
  skipButton: FakeEl;
  /** TASK-45.4: the bar wrapper, the progressbar, the status message and the stall sub-line. */
  bar: FakeEl;
  track: FakeEl;
  msg: FakeEl;
  sub: FakeEl;
  /** Sets the clock to `t` and runs the timers due by then, in order (needs `clock`). */
  advance(t: number): void;
  /** Calls the document's listeners for `type` (DOMContentLoaded). */
  docDispatch(type: string): void;
}

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

interface FakeEl {
  attrs: Record<string, string>;
  props: Record<string, string>;
  textContent: string;
  listeners: Record<string, ((e: unknown) => void)[]>;
  setAttribute(k: string, v: string): void;
  removeAttribute(k: string): void;
  hasAttribute(k: string): boolean;
  addEventListener(t: string, fn: (e: unknown) => void): void;
  contains(x: unknown): boolean;
  querySelector(sel: string): FakeEl | null;
  style: { setProperty(k: string, v: string): void };
}

function fakeEl(children: Record<string, FakeEl> = {}): FakeEl {
  const el: FakeEl = {
    attrs: {},
    props: {},
    textContent: "",
    listeners: {},
    setAttribute: (k, v) => {
      el.attrs[k] = v;
    },
    removeAttribute: (k) => {
      delete el.attrs[k];
    },
    hasAttribute: (k) => k in el.attrs,
    addEventListener: (t, fn) => {
      (el.listeners[t] ??= []).push(fn);
    },
    contains: (x) => x === el || Object.values(children).includes(x as FakeEl),
    querySelector: (sel) => children[sel] ?? null,
    style: {
      setProperty: (k, v) => {
        el.props[k] = v;
      },
    },
  };
  return el;
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
  opts: {
    session?: string | null;
    search?: string;
    pathname?: string;
    throwStorage?: boolean;
    clock?: { t: number };
    /** Shared tab storage, so a second stub is a reload of the same tab. */
    tab?: KV;
    /** Render the overlay and app nodes (otherwise getElementById finds nothing). */
    dom?: boolean;
  } = {},
): Stub {
  const attrs: Record<string, string> = {};
  const marks: string[] = [];
  const timers: Stub["timers"] = [];
  const listeners: { type: string; fn: (e: unknown) => void; capture: boolean }[] = [];
  let nextId = 0;
  let t = 0;
  const store = (init: Record<string, string>): KV => {
    const data = { ...init };
    return {
      getItem: (k: string) => (k in data ? (data[k] as string) : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    };
  };
  const local = store(opts.session ? { "verilane-session": opts.session } : {});
  const tab = opts.tab ?? store({});
  const skipButton = fakeEl();
  const status = fakeEl();
  const bar = fakeEl();
  const track = fakeEl();
  const msg = fakeEl();
  const sub = fakeEl();
  const overlay = fakeEl({
    "[data-splash-skip]": skipButton,
    "[data-splash-status]": status,
    "[data-splash-bar]": bar,
    "[role=progressbar]": track,
    "[data-splash-msg]": msg,
    "[data-splash-sub]": sub,
  });
  const app = fakeEl();
  const docListeners: { type: string; fn: () => void }[] = [];
  const location = { search: opts.search ?? "", pathname: opts.pathname ?? "/" };
  const documentElement = {
    setAttribute: (k: string, v: string) => {
      attrs[k] = v;
    },
    getAttribute: (k: string) => attrs[k] ?? null,
  };
  const window: Stub["window"] = {
    document: {
      documentElement,
      getElementById: (id: string) =>
        !opts.dom ? null : id === "verilane-splash" ? overlay : id === "verilane-app" ? app : null,
      addEventListener: (type: string, fn: () => void) => {
        docListeners.push({ type, fn });
      },
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
      timers.push({ fn, delay, id: nextId, due: (opts.clock ? opts.clock.t : 0) + delay });
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
    location,
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
  const advance = (to: number) => {
    for (let i = 0; i < 200; i++) {
      const due = timers.filter((x) => x.due <= to).sort((a, b) => a.due - b.due)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      if (opts.clock) opts.clock.t = due.due;
      due.fn();
    }
    if (opts.clock) opts.clock.t = to;
  };
  const docDispatch = (type: string) => docListeners.filter((l) => l.type === type).forEach((l) => l.fn());
  return { attrs, marks, window, timers, dispatch, flush, local, tab, location, overlay, app, skipButton, bar, track, msg, sub, advance, docDispatch };
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
    // TASK-45.3: forcing needs a stored guest session too (PRD §2.3: all must hold).
    const on = stubWindow({ session: "guest", search: "?__splash=1" });
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
  // TASK-45.3: after done, show() re-runs decide(), so only a cleared seen flag replays.
  it("show() while the splash is live is a no-op; after done it replays only once the seen flag is cleared", () => {
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
    expect(stub.attrs["data-splash"]).toBe("done");
    stub.tab.removeItem("verilane-splash-seen");
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
      const down = stub.dispatch("pointerdown", { button: 0 });
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
      stub.dispatch("pointerdown", { button: 0 });
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

    // N-1: only a primary press has a click of its own to swallow.
    it("a right-button skip arms nothing, so a later keyboard click reaches the app", () => {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", clock });
      exec(prod, stub);
      clock.t = 300;
      stub.dispatch("pointerdown", { button: 2 });
      expect(stub.attrs["data-splash"]).toBe("exit");
      clock.t = 400;
      expect(stub.dispatch("click", { detail: 0 }).defaultPrevented).toBe(false);
    });

    it("a right-button skip arms nothing, so its own pointerup and click reach the app", () => {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", clock });
      exec(prod, stub);
      clock.t = 300;
      stub.dispatch("pointerdown", { button: 2 });
      expect(stub.attrs["data-splash"]).toBe("exit");
      clock.t = 310;
      stub.dispatch("pointerup", { button: 2 });
      expect(stub.dispatch("click", { detail: 1 }).defaultPrevented).toBe(false);
    });

    it("a keyboard-activated click (detail 0) is not the press's click", () => {
      const { stub, clock } = skipByPointer();
      clock.t = 310;
      expect(stub.dispatch("click", { detail: 0 }).defaultPrevented).toBe(false);
      stub.dispatch("pointerup");
      expect(stub.dispatch("click", { detail: 1 }).defaultPrevented).toBe(true);
    });

    it("a context menu ends the swallow", () => {
      const { stub, clock } = skipByPointer();
      clock.t = 310;
      stub.dispatch("contextmenu");
      stub.dispatch("pointerup");
      expect(stub.dispatch("click", { detail: 1 }).defaultPrevented).toBe(false);
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
    stub.dispatch("pointerdown", { button: 0 });
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
    stub.tab.removeItem("verilane-splash-seen");
    stub.window.verilaneSplash?.show();
    expect(stub.attrs["data-splash"]).toBe("on");
    // Fire whatever stop() left behind; it must not unbind the new run.
    leftBehind.forEach((x) => x.fn());
    clock.t = 1100;
    stub.dispatch("pointerdown", { button: 0 });
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

  // TASK-45.3 · 45.3.2: once per tab, client entry, phase replay, bfcache.
  describe("once per tab and client entry (45.3.2)", () => {
    const painted = (stub: Stub) => stub.marks.filter((x) => x === "splash:painted").length;

    it("showing sets the tab's seen flag, so a reload of the tab does not replay", () => {
      const first = stubWindow({ session: "guest" });
      exec(prod, first);
      expect(first.attrs["data-splash"]).toBe("on");
      expect(first.tab.getItem("verilane-splash-seen")).toBe("1");
      const reload = stubWindow({ session: "guest", tab: first.tab });
      exec(prod, reload);
      expect(reload.attrs["data-splash"]).toBeUndefined();
      expect(reload.window.verilaneSplash?.state()).toBe("off");
    });

    it("a new tab (fresh tab storage) shows it again", () => {
      const first = stubWindow({ session: "guest" });
      exec(prod, first);
      const other = stubWindow({ session: "guest" });
      exec(prod, other);
      expect(other.attrs["data-splash"]).toBe("on");
    });

    it("never shows, or sets the flag, on an auth route", () => {
      for (const pathname of ["/welcome", "/sign-in", "/sign-up", "/onboarding", "/onboarding/x"]) {
        const stub = stubWindow({ session: "guest", pathname });
        exec(prod, stub);
        expect(stub.attrs["data-splash"]).toBeUndefined();
        expect(stub.tab.getItem("verilane-splash-seen")).toBeNull();
      }
    });

    it("client entry: show() re-decides against the current session and path", () => {
      const stub = stubWindow({ session: null, pathname: "/onboarding", dom: true });
      exec(prod, stub);
      expect(stub.window.verilaneSplash?.state()).toBe("off");
      // onboarding Finish: the session is stored, then the router lands on "/"
      stub.local.setItem("verilane-session", "guest");
      stub.window.verilaneSplash?.show();
      expect(stub.attrs["data-splash"]).toBeUndefined();
      stub.location.pathname = "/";
      stub.window.verilaneSplash?.show();
      stub.window.verilaneSplash?.show();
      expect(stub.attrs["data-splash"]).toBe("on");
      expect(painted(stub)).toBe(1);
      expect(stub.tab.getItem("verilane-splash-seen")).toBe("1");
      expect(stub.app.hasAttribute("inert")).toBe(true);
    });

    it("show() with storage blocked stays off and does not throw", () => {
      const stub = stubWindow({ session: "guest", throwStorage: true });
      exec(prod, stub);
      expect(() => stub.window.verilaneSplash?.show()).not.toThrow();
      expect(stub.window.verilaneSplash?.state()).toBe("off");
    });

    it("replays phases emitted before show() into the new run", () => {
      const stub = stubWindow({ session: null, dom: true });
      exec(prod, stub);
      stub.dispatch("verilane:splash", { detail: { phase: "session" } });
      stub.dispatch("verilane:splash", { detail: { phase: "provider" } });
      stub.local.setItem("verilane-session", "guest");
      stub.window.verilaneSplash?.show();
      expect(stub.overlay.props["--splash-p"]).toBe("0.65");
      stub.dispatch("verilane:splash", { detail: { phase: "ready" } });
      expect(stub.overlay.props["--splash-p"]).toBe("1");
    });

    it("a new session phase starts a new log, so an earlier mount's phases are not replayed", () => {
      const stub = stubWindow({ session: null, dom: true });
      exec(prod, stub);
      for (const phase of ["session", "provider", "ready", "session"])
        stub.dispatch("verilane:splash", { detail: { phase } });
      stub.local.setItem("verilane-session", "guest");
      stub.window.verilaneSplash?.show();
      expect(stub.overlay.props["--splash-p"]).toBe("0.35");
      expect(stub.attrs["data-splash"]).toBe("on");
    });

    it("reset() drops an ended mount's log, so a remount that skips the session phase replays nothing (review R-3)", () => {
      const stub = stubWindow({ session: null, dom: true });
      exec(prod, stub);
      for (const phase of ["session", "provider", "ready"])
        stub.dispatch("verilane:splash", { detail: { phase } });
      stub.window.verilaneSplash?.reset(); // GatedApp unmounted
      stub.local.setItem("verilane-session", "guest");
      stub.window.verilaneSplash?.show(); // the next mount's client entry
      expect(stub.attrs["data-splash"]).toBe("on");
      expect(stub.overlay.props["--splash-p"]).not.toBe("1");
      expect(stub.marks).not.toContain("splash:exit");
    });

    it("reset() leaves a live splash alone and never throws", () => {
      const stub = stubWindow({ session: "guest", dom: true });
      exec(prod, stub);
      expect(() => stub.window.verilaneSplash?.reset()).not.toThrow();
      expect(stub.attrs["data-splash"]).toBe("on");
      stub.dispatch("verilane:splash", { detail: { phase: "session" } });
      expect(stub.overlay.props["--splash-p"]).toBe("0.35");
    });

    it("binds the skip button even when the hard load decided off, so a client-entry splash can be skipped", () => {
      const clock = { t: 0 };
      const stub = stubWindow({ session: null, dom: true, clock });
      exec(prod, stub);
      stub.docDispatch("DOMContentLoaded");
      stub.local.setItem("verilane-session", "guest");
      stub.window.verilaneSplash?.show();
      clock.t = 10;
      (stub.skipButton.listeners.click ?? []).forEach((fn) => fn({}));
      expect(stub.attrs["data-splash"]).toBe("exit");
    });

    // Carry-in Q2 (EXE48): the skip button leaves the tab order once the exit starts.
    it("the overlay is inert from the exit on, and not inert again on a replay", () => {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", dom: true, clock });
      exec(prod, stub);
      expect(stub.overlay.hasAttribute("inert")).toBe(false);
      clock.t = 300;
      stub.window.verilaneSplash?.skip();
      expect(stub.overlay.hasAttribute("inert")).toBe(true);
      expect(stub.app.hasAttribute("inert")).toBe(false);
      clock.t = 700;
      stub.flush();
      stub.tab.removeItem("verilane-splash-seen");
      stub.window.verilaneSplash?.show();
      expect(stub.overlay.hasAttribute("inert")).toBe(false);
    });

    it("a bfcache restore (pageshow persisted) ends a live splash at once", () => {
      const stub = stubWindow({ session: "guest", dom: true });
      exec(prod, stub);
      stub.dispatch("pageshow", { persisted: false });
      expect(stub.attrs["data-splash"]).toBe("on");
      stub.dispatch("pageshow", { persisted: true });
      expect(stub.attrs["data-splash"]).toBe("done");
      expect(stub.app.hasAttribute("inert")).toBe(false);
      expect(stub.marks).toContain("splash:done");
      // nothing left listening: a key no longer reaches the runtime
      expect(stub.dispatch("keydown", { key: "a" }).stopped).toBe(false);
    });
  });

  // TASK-45.4 · 45.4.3: the bar, status and stall effects reach the right nodes.
  describe("progress bar and status DOM (45.4)", () => {
    const phase = (stub: Stub, p: string) => stub.dispatch("verilane:splash", { detail: { phase: p } });

    it("each phase sets the fill and aria-valuenow together", () => {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", dom: true, clock });
      exec(prod, stub);
      for (const [p, v] of [["session", 35], ["provider", 65], ["seeding", 80], ["ready", 100]] as const) {
        clock.t += 100;
        phase(stub, p);
        expect(stub.track.attrs["aria-valuenow"]).toBe(String(v));
        expect(stub.overlay.props["--splash-p"]).toBe(String(v / 100));
      }
    });

    it("seeding updates the message and valuetext but not the skip button; ready turns it into Continue", () => {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", dom: true, clock });
      exec(prod, stub);
      phase(stub, "seeding");
      expect(stub.msg.textContent).toBe("Verilane. Preparing demo data…");
      expect(stub.track.attrs["aria-valuetext"]).toBe("Preparing demo data…");
      expect(stub.skipButton.textContent).toBe("");
      phase(stub, "ready");
      expect(stub.msg.textContent).toBe("Verilane. Workspace ready");
      expect(stub.track.attrs["aria-valuetext"]).toBe("Workspace ready");
      expect(stub.skipButton.textContent).toBe("Continue");
    });

    it("reveals at 3.2 s, stalls 1.5 s after the last phase, shows the sub-line after a 4 s stall, and ready clears both", () => {
      const clock = { t: 0 };
      const stub = stubWindow({ session: "guest", dom: true, clock });
      exec(prod, stub);
      clock.t = 2500;
      phase(stub, "session");
      stub.advance(3199);
      expect(stub.bar.attrs["data-splash-bar"]).toBeUndefined();
      stub.advance(3200);
      expect(stub.bar.attrs["data-splash-bar"]).toBe("shown");
      expect(stub.bar.hasAttribute("data-stalled")).toBe(false);
      stub.advance(4000);
      expect(stub.bar.hasAttribute("data-stalled")).toBe(true);
      expect(stub.sub.textContent).toBe("");
      stub.advance(6500);
      expect(stub.sub.textContent).toBe("Still working — first visits can take a few seconds.");
      expect(stub.track.attrs["aria-valuenow"]).toBe("35");
      phase(stub, "ready");
      expect(stub.bar.hasAttribute("data-stalled")).toBe(false);
      expect(stub.sub.textContent).toBe("");
    });
  });

  it("swallows a throw from a broken window", () => {
    expect(() => vm.runInNewContext(prod, { window: {} })).not.toThrow();
  });
});
