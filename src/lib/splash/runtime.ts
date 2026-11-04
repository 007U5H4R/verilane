/**
 * TASK-45.2: the splash runtime. It runs as an inline head script before
 * first paint (the THEME_SCRIPT pattern in app/layout.tsx), so it cannot
 * import anything and must survive being stringified after server
 * minification. That is why every piece lives inside the one self-contained
 * `splashRuntime()` function (EXE34): a minifier may rename its locals but
 * cannot split it, and `buildSplashScript` serialises it whole.
 *
 * State lives only in `html[data-splash]` (on | hold | exit | done). `step()`
 * is the pure state machine; `boot()` is the thin DOM shell around it.
 * Rules: no imports, no object spread, no async — nothing that would make the
 * compiler emit a helper outside this function.
 */

import { AUTH_ROUTES } from "@/lib/auth-routes";

export type Attr = "on" | "hold" | "exit" | "done";

export interface SplashCopy {
  opening: string;
  /** Only after a real seeding phase (Design §7). */
  seeding: string;
  ready: string;
  error: string;
  skip: string;
  cont: string;
  /** The long-stall sub-line (Design §4). */
  stall: string;
  /** Spoken lead-in on the status line; dropped from the bar's aria-valuetext. */
  prefix: string;
}

export interface SplashConfig {
  /** Minimum on-screen time, ms (Design §18). */
  D: number;
  exitMs: number;
  /** Beat between readiness and the exit when readiness lands after D. */
  beatMs: number;
  /** Input inside this window after paint is ignored (TC-132). */
  guardMs: number;
  /** Hard ceiling = D + ceilingExtra; the overlay exits regardless. */
  ceilingExtra: number;
  /** The bar is revealed this long after paint (Design §1: amends PRD R13's 4.0 s). */
  revealAt: number;
  /** Stalled: this long since the last phase, after reveal, not ready (Design §4). */
  stallMs: number;
  /** The sub-line shows after a stall this long … */
  stallLineMs: number;
  /** … or this long past D, whichever comes first. */
  stallLinePastD: number;
  e2e: boolean;
  /** URL param that forces the splash on in e2e builds; "" outside e2e. */
  forceParam: string;
  forceKey: string;
  sessionKey: string;
  /** Tab-scoped "already shown" flag (PRD §2.3). */
  seenKey: string;
  /** `AUTH_ROUTES` from `src/lib/auth-routes.ts`; never shown on these or below them. */
  authRoutes: readonly string[];
  copy: SplashCopy;
}

export interface Model {
  t0: number;
  attr: Attr;
  phases: string[];
  tReady: number | null;
  exitAt: number | null;
  tExit: number | null;
  skipped: boolean;
  /** Time of the last accepted phase (paint counts as the first). */
  lastT: number;
  revealed: boolean;
  stalled: boolean;
  longStall: boolean;
}

export type Effect =
  | { k: "attr"; v: Attr }
  | { k: "mark"; v: string }
  | { k: "warn"; v: string }
  | { k: "timer"; v: number }
  | { k: "status"; v: string }
  | { k: "bar"; v: number }
  | { k: "cont" }
  | { k: "reveal" }
  | { k: "stall"; v: boolean }
  | { k: "sub"; v: string }
  | { k: "uninert" };

export type SplashEvent =
  | { type: "tick"; t: number }
  | { type: "phase"; phase: string; t: number }
  | { type: "input"; t: number; repeat?: boolean; mod?: boolean };

export interface DecideEnv {
  path: string;
  session: string | null;
  seen: boolean;
  force: boolean;
  storageOk: boolean;
  rm: boolean;
}

export interface SplashApi {
  show(): void;
  skip(): void;
  state(): Attr | "off";
  /** TASK-45.3 (review R-3): a GatedApp mount ended; forget its phases. */
  reset(): void;
}

declare global {
  interface Window {
    /** TASK-45.2: the splash's public API (state, skip, replay). */
    verilaneSplash?: SplashApi;
  }
}

interface Runtime {
  decide(env: DecideEnv, cfg: SplashConfig): boolean;
  progress(phases: string[]): number;
  begin(t0: number, cfg: SplashConfig): { m: Model; fx: Effect[] };
  step(m: Model, ev: SplashEvent, cfg: SplashConfig): { m: Model; fx: Effect[] };
  boot(w: Window, cfg: SplashConfig): void;
}

export function splashRuntime(): Runtime {
  const PROGRESS: Record<string, number> = { session: 35, provider: 65, seeding: 80, ready: 100, error: 100 };

  // PRD §2.3: all of these must hold. Reduced motion (env.rm) only changes
  // the length, never whether it shows (TASK-45.6).
  function decide(env: DecideEnv, cfg: SplashConfig): boolean {
    if (!env.storageOk || env.seen || env.session !== "guest") return false;
    const p = env.path;
    for (let i = 0; i < cfg.authRoutes.length; i++) {
      const r = cfg.authRoutes[i];
      if (p === r || p.indexOf(r + "/") === 0) return false;
    }
    return cfg.e2e ? env.force : true;
  }

  function progress(phases: string[]): number {
    let p = 10;
    phases.forEach(function (ph) {
      const v = PROGRESS[ph];
      if (v && v > p) p = v;
    });
    return p;
  }

  function with_(m: Model, patch: Partial<Model>): Model {
    return Object.assign({}, m, patch);
  }

  function begin(t0: number, cfg: SplashConfig): { m: Model; fx: Effect[] } {
    const m: Model = {
      t0: t0,
      attr: "on",
      phases: [],
      tReady: null,
      exitAt: null,
      tExit: null,
      skipped: false,
      lastT: t0,
      revealed: false,
      stalled: false,
      longStall: false,
    };
    return {
      m: m,
      fx: [
        { k: "attr", v: "on" },
        { k: "mark", v: "splash:painted" },
        { k: "timer", v: t0 + cfg.revealAt },
        { k: "timer", v: t0 + cfg.D },
        { k: "timer", v: t0 + cfg.D + cfg.stallLinePastD },
        { k: "timer", v: t0 + cfg.D + cfg.ceilingExtra },
      ],
    };
  }

  // Design §4: reveal, the stall glint and the stall line are pure functions
  // of time since paint and since the last phase. They are visual only and
  // never touch the bar's value (R13). Each flag is emitted only on change.
  function visuals(m: Model, t: number, cfg: SplashConfig, fx: Effect[]): Model {
    const ready = m.tReady !== null;
    const revealed = m.revealed || t >= m.t0 + cfg.revealAt;
    const stalled = revealed && !ready && t - m.lastT >= cfg.stallMs;
    // sticky until ready: a line that comes and goes reads as flicker
    const longStall =
      !ready && (m.longStall || t - m.lastT >= cfg.stallLineMs || t >= m.t0 + cfg.D + cfg.stallLinePastD);
    if (revealed && !m.revealed) fx.push({ k: "reveal" });
    if (stalled !== m.stalled) fx.push({ k: "stall", v: stalled });
    if (longStall !== m.longStall) fx.push({ k: "sub", v: longStall ? cfg.copy.stall : "" });
    if (revealed === m.revealed && stalled === m.stalled && longStall === m.longStall) return m;
    return with_(m, { revealed: revealed, stalled: stalled, longStall: longStall });
  }

  function exit(m: Model, t: number, cfg: SplashConfig, fx: Effect[]): Model {
    // Mark first: it records when the exit began; un-inerting can take tens of ms.
    fx.push({ k: "mark", v: "splash:exit" }, { k: "attr", v: "exit" }, { k: "uninert" }, { k: "timer", v: t + cfg.exitMs });
    return with_(m, { attr: "exit", tExit: t });
  }

  function live(m: Model): boolean {
    return m.attr === "on" || m.attr === "hold";
  }

  function step(m: Model, ev: SplashEvent, cfg: SplashConfig): { m: Model; fx: Effect[] } {
    const fx: Effect[] = [];
    if (ev.type === "phase") {
      if (!live(m) || m.phases.indexOf(ev.phase) >= 0 || !(ev.phase in PROGRESS)) return { m: m, fx: fx };
      const phases = m.phases.concat([ev.phase]);
      let n = with_(m, { phases: phases, lastT: ev.t });
      fx.push({ k: "bar", v: progress(phases) });
      if ((ev.phase === "ready" || ev.phase === "error") && m.tReady === null) {
        const exitAt = Math.max(m.t0 + cfg.D, ev.t + cfg.beatMs);
        n = with_(n, { tReady: ev.t, exitAt: exitAt });
        fx.push(
          { k: "status", v: ev.phase === "error" ? cfg.copy.error : cfg.copy.ready },
          { k: "cont" },
          { k: "timer", v: exitAt },
        );
      } else if (m.tReady === null) {
        if (ev.phase === "seeding") fx.push({ k: "status", v: cfg.copy.seeding });
        fx.push({ k: "timer", v: ev.t + cfg.stallMs }, { k: "timer", v: ev.t + cfg.stallLineMs });
      }
      return { m: visuals(n, ev.t, cfg, fx), fx: fx };
    }
    if (ev.type === "tick") {
      const t = ev.t;
      if (m.attr === "exit") {
        if (m.tExit !== null && t >= m.tExit + cfg.exitMs) {
          fx.push({ k: "attr", v: "done" }, { k: "mark", v: "splash:done" });
          return { m: with_(m, { attr: "done" }), fx: fx };
        }
        return { m: m, fx: fx };
      }
      if (!live(m)) return { m: m, fx: fx };
      m = visuals(m, t, cfg, fx);
      if (t >= m.t0 + cfg.D + cfg.ceilingExtra) {
        fx.push({ k: "mark", v: "splash:ceiling" });
        const n = exit(m, t, cfg, fx);
        // Warn last: console.warn is slow under devtools and must not delay the exit.
        fx.push({ k: "warn", v: "[verilane] splash ceiling reached before the app was ready" });
        return { m: n, fx: fx };
      }
      if (m.exitAt !== null && t >= m.exitAt) return { m: exit(m, t, cfg, fx), fx: fx };
      if (m.attr === "on" && t >= m.t0 + cfg.D) {
        fx.push({ k: "attr", v: "hold" });
        return { m: with_(m, { attr: "hold" }), fx: fx };
      }
      return { m: m, fx: fx };
    }
    // input
    if (!live(m) || ev.repeat || ev.mod || ev.t - m.t0 < cfg.guardMs) return { m: m, fx: fx };
    fx.push({ k: "mark", v: "splash:skip" });
    return { m: exit(with_(m, { skipped: true }), ev.t, cfg, fx), fx: fx };
  }

  function boot(w: Window, cfg: SplashConfig): void {
    const d = w.document;
    const de = d.documentElement;
    const perf = w.performance;
    let m: Model | null = null;
    let app: HTMLElement | null = null;
    let mo: MutationObserver | null = null;
    // The skipping press's click is swallowed. That click lands on pointerup,
    // so the swallow is tied to the press, not a clock from pointerdown: it is
    // armed on the skipping pointerdown, ends GRACE ms after its pointerup (a
    // click comes right after the up, or never), and a new press or a
    // pointercancel ends it early. While armed, the pointer listeners outlive
    // the overlay.
    const GRACE = 500;
    let listening = false;
    let armed = false;
    let upAt = 0;
    let disarmT = 0;
    // Keys whose default scrolls the page; a skipping one would scroll the app.
    const SCROLL_KEYS = [" ", "Spacebar", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
    const now = function () {
      return perf.now();
    };

    function overlay(): HTMLElement | null {
      return d.getElementById("verilane-splash");
    }

    function q(sel: string): HTMLElement | null {
      const o = overlay();
      return o ? (o.querySelector(sel) as HTMLElement | null) : null;
    }

    function setInert(on: boolean) {
      if (!app) app = d.getElementById("verilane-app");
      if (!app) return;
      if (on) app.setAttribute("inert", "");
      else app.removeAttribute("inert");
    }

    function apply(fx: Effect[]) {
      fx.forEach(function (f) {
        try {
          if (f.k === "attr") de.setAttribute("data-splash", f.v);
          else if (f.k === "mark") perf.mark(f.v);
          else if (f.k === "warn") (w as Window & typeof globalThis).console.warn(f.v);
          else if (f.k === "timer") {
            // A timer may fire a hair before now() reaches its deadline; tick
            // at the deadline so that never reads as "not yet" and strands it.
            const due = f.v;
            w.setTimeout(function () {
              run({ type: "tick", t: Math.max(now(), due) });
            }, Math.max(0, due - now()));
          }
          else if (f.k === "uninert") {
            setInert(false);
            const o = overlay();
            // EXE48: the exiting overlay leaves the tab order too (Q2)
            if (o) o.setAttribute("inert", "");
            const a = d.activeElement as HTMLElement | null;
            if (o && a && o.contains(a) && a.blur) a.blur();
          } else if (f.k === "status") {
            // one live region: only the message node changes, so the
            // sub-line beside it is not re-announced (Design §7)
            const s = q("[data-splash-msg]") || q("[data-splash-status]");
            if (s) s.textContent = f.v;
            const pb = q("[role=progressbar]");
            const pre = cfg.copy.prefix;
            if (pb) pb.setAttribute("aria-valuetext", f.v.indexOf(pre) === 0 ? f.v.slice(pre.length) : f.v);
          } else if (f.k === "cont") {
            const b = q("[data-splash-skip]");
            if (b) b.textContent = cfg.copy.cont;
          } else if (f.k === "bar") {
            const o3 = overlay();
            if (o3) o3.style.setProperty("--splash-p", String(f.v / 100));
            const pb2 = q("[role=progressbar]");
            if (pb2) pb2.setAttribute("aria-valuenow", String(f.v));
          } else if (f.k === "reveal") {
            const r = q("[data-splash-bar]");
            if (r) r.setAttribute("data-splash-bar", "shown");
          } else if (f.k === "stall") {
            const g = q("[data-splash-bar]");
            if (g) {
              if (f.v) g.setAttribute("data-stalled", "");
              else g.removeAttribute("data-stalled");
            }
          } else if (f.k === "sub") {
            const sub = q("[data-splash-sub]");
            if (sub) sub.textContent = f.v;
          }
        } catch {
          /* one failed effect must not strand the overlay */
        }
      });
      if (m && m.attr === "done") stop();
    }

    function run(ev: SplashEvent) {
      if (!m) return;
      const r = step(m, ev, cfg);
      m = r.m;
      apply(r.fx);
    }

    // Phases are logged whether or not the splash is live, so a client-entry
    // show() can replay what the mount already reported. "session" is the
    // first phase of a GatedApp mount: it starts a new log.
    let log: { phase: string; t: number }[] = [];
    function onPhase(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail || typeof detail.phase !== "string") return;
      const t = now();
      if (detail.phase === "session") log = [];
      log.push({ phase: detail.phase, t: t });
      run({ type: "phase", phase: detail.phase, t: t });
    }

    function onKey(e: KeyboardEvent) {
      if (!m || (m.attr !== "on" && m.attr !== "hold")) return;
      const before = m.attr;
      run({ type: "input", t: now(), repeat: e.repeat, mod: e.ctrlKey || e.metaKey || e.altKey });
      // The skipping key reaches nothing behind the overlay. Its default is
      // left alone (F5, Escape, Enter …) unless it would scroll the app.
      if (m.attr !== before) {
        e.stopImmediatePropagation();
        if (SCROLL_KEYS.indexOf(e.key) >= 0) e.preventDefault();
      }
    }

    function onPointer(e: PointerEvent) {
      // a new press ends the previous one's swallow
      if (armed) disarm();
      if (!m || (m.attr !== "on" && m.attr !== "hold")) return;
      const before = m.attr;
      run({ type: "input", t: now() });
      if (m.attr !== before) {
        e.stopImmediatePropagation();
        // only a primary press is followed by a click of its own (N-1)
        armed = !e.button;
        upAt = 0;
      }
    }

    function onUp() {
      if (!armed || upAt) return;
      upAt = now();
      disarmT = w.setTimeout(disarm, GRACE);
    }

    function onClick(e: MouseEvent) {
      // detail 0: keyboard/synthetic activation, not the press's click
      if (!armed || e.detail === 0 || (upAt && now() > upAt + GRACE)) return;
      disarm();
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    function bindPointer(on: boolean) {
      const f = on ? w.addEventListener : w.removeEventListener;
      f.call(w, "pointerdown", onPointer as EventListener, true);
      f.call(w, "pointerup", onUp, true);
      f.call(w, "pointercancel", disarm, true);
      f.call(w, "contextmenu", disarm, true);
      f.call(w, "click", onClick as EventListener, true);
    }

    function disarm() {
      armed = false;
      upAt = 0;
      if (disarmT) w.clearTimeout(disarmT);
      disarmT = 0;
      if (!listening) bindPointer(false);
    }

    function watchApp() {
      if (d.getElementById("verilane-app")) {
        setInert(true);
        return;
      }
      const MO = (w as Window & typeof globalThis).MutationObserver;
      if (typeof MO !== "function") return;
      const obs = new MO(function () {
        if (d.getElementById("verilane-app")) {
          if (m && (m.attr === "on" || m.attr === "hold")) setInert(true);
          if (mo) mo.disconnect();
          mo = null;
        }
      });
      mo = obs;
      obs.observe(de, { childList: true, subtree: true });
      d.addEventListener("DOMContentLoaded", function () {
        if (mo) mo.disconnect();
        mo = null;
        if (m && (m.attr === "on" || m.attr === "hold")) setInert(true);
      });
    }

    // Idempotent: stale timers tick after done and land here again.
    function stop() {
      if (!listening) return;
      listening = false;
      w.removeEventListener("keydown", onKey, true);
      // an armed swallow keeps the pointer listeners until its press ends
      if (!armed) bindPointer(false);
    }

    function readEnv(): DecideEnv {
      let storageOk = true;
      let session: string | null = null;
      let seen = false;
      let force = false;
      try {
        session = w.localStorage.getItem(cfg.sessionKey);
        const ss = w.sessionStorage;
        seen = ss.getItem(cfg.seenKey) === "1";
        if (cfg.forceParam) {
          if (new URLSearchParams(w.location.search).get(cfg.forceParam) === "1") ss.setItem(cfg.forceKey, "1");
          force = ss.getItem(cfg.forceKey) === "1";
        }
      } catch {
        storageOk = false;
      }
      return { path: w.location.pathname, session: session, seen: seen, force: force, storageOk: storageOk, rm: false };
    }

    function start() {
      const r = begin(now(), cfg);
      m = r.m;
      // a replay starts clean: no swallow carried over from the last run
      disarm();
      listening = true;
      w.addEventListener("keydown", onKey, true);
      bindPointer(true);
      const o = overlay();
      if (o) o.removeAttribute("inert");
      apply(r.fx);
      watchApp();
      // what this mount reported before show() ran
      const t0 = m.t0;
      log.slice().forEach(function (x) {
        run({ type: "phase", phase: x.phase, t: Math.max(x.t, t0) });
      });
    }

    // Hard load and client entry alike: once per tab, never while live.
    function show() {
      if (m && m.attr !== "done") return;
      if (!decide(readEnv(), cfg)) return;
      try {
        w.sessionStorage.setItem(cfg.seenKey, "1");
      } catch {
        return;
      }
      start();
    }

    // A bfcache restore brings back a frozen live splash; end it at once.
    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted || !m || m.attr === "done") return;
      m = with_(m, { attr: "done" });
      apply([{ k: "uninert" }, { k: "attr", v: "done" }, { k: "mark", v: "splash:done" }]);
    }

    const api: SplashApi = {
      show: show,
      skip: function () {
        if (!m || (m.attr !== "on" && m.attr !== "hold")) return;
        // the guard protects against stray input, not an explicit call
        const t = Math.max(now(), m.t0 + cfg.guardMs);
        run({ type: "input", t: t });
      },
      state: function () {
        return m ? m.attr : "off";
      },
      // A GatedApp mount ended (its layout-effect cleanup). Its phases must
      // not replay into the next mount's client entry, which may never emit
      // "session" (review R-3). A live splash keeps running.
      reset: function () {
        log = [];
      },
    };
    w.verilaneSplash = api;

    w.addEventListener("verilane:splash", onPhase);
    w.addEventListener("pageshow", onPageShow as EventListener);
    show();
    // The skip button is server-rendered after this script; bind it once it
    // exists, whether or not this load showed the splash (client entry may).
    d.addEventListener("DOMContentLoaded", function () {
      const b = overlay() && overlay()!.querySelector("[data-splash-skip]");
      if (b) b.addEventListener("click", function () {
        api.skip();
      });
    });
  }

  return { decide: decide, progress: progress, begin: begin, step: step, boot: boot };
}

export const { decide, progress, begin, step, boot } = splashRuntime();

export const SPLASH_COPY: SplashCopy = {
  opening: "Verilane. Opening workspace…",
  seeding: "Verilane. Preparing demo data…",
  ready: "Verilane. Workspace ready",
  error: "Verilane. Workspace opened",
  skip: "Skip intro",
  cont: "Continue",
  stall: "Still working — first visits can take a few seconds.",
  prefix: "Verilane. ",
};

export function splashConfig(e2e: boolean): SplashConfig {
  return {
    D: 5700,
    exitMs: 300,
    beatMs: 250,
    guardMs: 250,
    ceilingExtra: 4000,
    revealAt: 3200,
    stallMs: 1500,
    stallLineMs: 4000,
    stallLinePastD: 1500,
    e2e: e2e,
    forceParam: e2e ? "__splash" : "",
    forceKey: "verilane-splash-force",
    sessionKey: "verilane-session",
    seenKey: "verilane-splash-seen",
    authRoutes: AUTH_ROUTES,
    copy: SPLASH_COPY,
  };
}

/** The inline head script: the whole runtime, booted against `window`, never throwing. */
export function buildSplashScript(cfg: SplashConfig): string {
  return "try{(" + splashRuntime.toString() + ")().boot(window," + JSON.stringify(cfg) + ")}catch(e){}";
}
