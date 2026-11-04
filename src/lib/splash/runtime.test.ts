/**
 * TASK-45.2 · TC-127 (part 1): the splash state machine in isolation.
 * `step()` is pure, so every case feeds timestamped events and reads the
 * returned model and effects. cfg: D=5700, exit 300, beat 250, guard 250,
 * ceiling 9700.
 */
import { describe, expect, it } from "vitest";

import { AUTH_ROUTES } from "@/lib/auth-routes";

import { begin, decide, progress, splashConfig, step, type Effect, type Model } from "./runtime";

const cfg = splashConfig(false);

type Ev = Parameters<typeof step>[1];

/** Runs events in order from a fresh start at t0 = 0; returns the final model and every effect. */
function run(events: Ev[]): { m: Model; fx: Effect[] } {
  const start = begin(0, cfg);
  let m = start.m;
  const fx: Effect[] = [...start.fx];
  for (const ev of events) {
    const r = step(m, ev, cfg);
    m = r.m;
    fx.push(...r.fx);
  }
  return { m, fx };
}

const attrs = (fx: Effect[]) => fx.filter((f) => f.k === "attr").map((f) => f.v);
const marks = (fx: Effect[]) => fx.filter((f) => f.k === "mark").map((f) => f.v);
const timers = (fx: Effect[]) => fx.filter((f) => f.k === "timer").map((f) => f.v);
const tick = (t: number): Ev => ({ type: "tick", t });
const phase = (p: string, t: number): Ev => ({ type: "phase", phase: p, t });
const key = (t: number, extra: Record<string, unknown> = {}): Ev => ({ type: "input", t, ...extra });

describe("splash config", () => {
  it("uses the frozen timings (Design §18)", () => {
    expect(cfg).toMatchObject({ D: 5700, exitMs: 300, beatMs: 250, guardMs: 250, ceilingExtra: 4000 });
  });
});

describe("begin", () => {
  it("turns the splash on, marks painted and schedules D and the ceiling", () => {
    const { m, fx } = begin(0, cfg);
    expect(m.attr).toBe("on");
    expect(attrs(fx)).toEqual(["on"]);
    expect(marks(fx)).toContain("splash:painted");
    expect(timers(fx)).toEqual(expect.arrayContaining([5700, 9700]));
  });
});

describe("step · exit timing (exitAt = max(t0 + D, tReady + beat))", () => {
  it("ready at 1 s exits at 5700, not before", () => {
    const early = run([phase("ready", 1000), tick(5699)]);
    expect(early.m.attr).toBe("on");
    const { m, fx } = run([phase("ready", 1000), tick(5700)]);
    expect(m.attr).toBe("exit");
    expect(fx).toContainEqual({ k: "uninert" });
    expect(marks(fx)).toContain("splash:exit");
  });

  it("ready at 7 s holds from D, then exits at 7250", () => {
    const held = run([tick(5700)]);
    expect(held.m.attr).toBe("hold");
    const before = run([tick(5700), phase("ready", 7000), tick(7249)]);
    expect(before.m.attr).toBe("hold");
    const { m } = run([tick(5700), phase("ready", 7000), tick(7250)]);
    expect(m.attr).toBe("exit");
  });

  it("schedules a timer at exitAt when ready arrives", () => {
    expect(timers(run([phase("ready", 7000)]).fx)).toContain(7250);
    expect(timers(run([phase("ready", 1000)]).fx)).toContain(5700);
  });

  it("goes to done exitMs after the exit starts", () => {
    const mid = run([phase("ready", 1000), tick(5700), tick(5999)]);
    expect(mid.m.attr).toBe("exit");
    const { m, fx } = run([phase("ready", 1000), tick(5700), tick(6000)]);
    expect(m.attr).toBe("done");
    expect(attrs(fx)).toEqual(["on", "exit", "done"]);
  });

  it("error counts as readiness, with its own status copy", () => {
    const { m, fx } = run([phase("error", 1000), tick(5700)]);
    expect(m.attr).toBe("exit");
    expect(fx).toContainEqual({ k: "status", v: cfg.copy.error });
  });

  it("ignores phases after the exit", () => {
    const { m } = run([phase("ready", 1000), tick(5700)]);
    expect(step(m, phase("ready", 5800), cfg).fx).toEqual([]);
    expect(step(m, phase("error", 5800), cfg).m).toEqual(m);
  });
});

// The exit mark is the moment the exit began: it must be stamped before
// un-inerting the app, which can take tens of ms (TC-134 saw done − exit 273 ms).
describe("step · exit effect order", () => {
  it("marks splash:exit before the attr change and un-inert", () => {
    const { fx } = run([phase("ready", 1000), tick(5700)]);
    const i = fx.findIndex((f) => f.k === "mark" && f.v === "splash:exit");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(fx.findIndex((f) => f.k === "uninert"));
    expect(i).toBeLessThan(fx.findIndex((f) => f.k === "attr" && f.v === "exit"));
  });

  // console.warn is slow with a devtools/CDP listener; it must not delay the exit.
  it("on the ceiling, warns only after the exit effects", () => {
    const { fx } = run([tick(5700), tick(9700)]);
    const w = fx.findIndex((f) => f.k === "warn");
    expect(w).toBeGreaterThan(fx.findIndex((f) => f.k === "mark" && f.v === "splash:exit"));
    expect(w).toBeGreaterThan(fx.findIndex((f) => f.k === "uninert"));
  });
});

describe("step · ceiling", () => {
  it("with no ready, exits at 9700 with a warning and the ceiling mark", () => {
    const before = run([tick(5700), tick(9699)]);
    expect(before.m.attr).toBe("hold");
    const { m, fx } = run([tick(5700), tick(9700)]);
    expect(m.attr).toBe("exit");
    expect(marks(fx)).toEqual(expect.arrayContaining(["splash:ceiling", "splash:exit"]));
    expect(fx.filter((f) => f.k === "warn")).toHaveLength(1);
    expect(String(fx.find((f) => f.k === "warn")?.v)).toMatch(/splash ceiling/i);
  });
});

describe("step · skip", () => {
  it("ignores input inside the 250 ms guard", () => {
    const { m, fx } = run([key(100)]);
    expect(m.attr).toBe("on");
    expect(m.skipped).toBe(false);
    expect(marks(fx)).not.toContain("splash:skip");
  });

  it("exits on input after the guard, marking skip then exit", () => {
    const { m, fx } = run([key(300)]);
    expect(m.attr).toBe("exit");
    expect(m.skipped).toBe(true);
    const ms = marks(fx);
    expect(ms.indexOf("splash:skip")).toBeGreaterThan(-1);
    expect(ms.indexOf("splash:exit")).toBeGreaterThan(ms.indexOf("splash:skip"));
    expect(fx).toContainEqual({ k: "uninert" });
  });

  it("ignores auto-repeat keys", () => {
    expect(run([key(400, { repeat: true })]).m.attr).toBe("on");
    expect(run([key(400, { repeat: true }), key(500)]).m.attr).toBe("exit");
  });

  it("ignores modifier shortcuts (Cmd/Ctrl/Alt)", () => {
    expect(run([key(400, { mod: true })]).m.attr).toBe("on");
  });

  it("works during hold, and is a no-op once exiting", () => {
    expect(run([tick(5700), key(6000)]).m.attr).toBe("exit");
    const twice = run([key(300), key(400)]);
    expect(marks(twice.fx).filter((x) => x === "splash:skip")).toHaveLength(1);
  });

  // TASK-45.2 R-7: a skip and ready landing in the same frame, in either order,
  // exit once and finish on the skip's clock; the timers they leave are no-ops.
  it.each([
    ["skip then ready", [key(300), phase("ready", 300)]],
    ["ready then skip", [phase("ready", 300), key(300)]],
  ])("%s in one frame exits once", (_name, same) => {
    const { m, fx } = run([...same, tick(600), tick(5700), tick(9700)]);
    expect(m.attr).toBe("done");
    expect(marks(fx).filter((x) => x === "splash:exit")).toHaveLength(1);
    expect(marks(fx).filter((x) => x === "splash:skip")).toHaveLength(1);
    expect(attrs(fx)).toEqual(["on", "exit", "done"]);
    expect(fx.filter((f) => f.k === "uninert")).toHaveLength(1);
  });
});

describe("progress (minimal)", () => {
  it("maps phases to targets and never exceeds 90 before ready", () => {
    expect(progress([])).toBe(10);
    expect(progress(["session"])).toBe(35);
    expect(progress(["session", "provider"])).toBe(65);
    expect(progress(["session", "provider", "seeding"])).toBe(80);
    expect(progress(["session", "provider", "seeding", "ready"])).toBe(100);
    expect(progress(["provider", "session"])).toBe(65);
  });
});

// TASK-45.3 · TC-136: every combination of the trigger inputs (PRD §2.3).
describe("decide truth table (TC-136)", () => {
  const PATHS = ["/", "/welcome", "/sign-in", "/sign-up", "/onboarding", "/queue"];
  const SESSIONS = ["guest", null, "garbage"];
  const AUTH = ["/welcome", "/sign-in", "/sign-up", "/onboarding"];
  const cases: { path: string; session: string | null; seen: boolean; storageOk: boolean; e2e: boolean; force: boolean }[] = [];
  for (const path of PATHS)
    for (const session of SESSIONS)
      for (const seen of [false, true])
        for (const storageOk of [true, false])
          for (const [e2e, force] of [
            [false, false],
            [false, true],
            [true, false],
            [true, true],
          ] as const)
            cases.push({ path, session, seen, storageOk, e2e, force });

  it.each(cases)("%o", ({ path, session, seen, storageOk, e2e, force }) => {
    const want = !AUTH.includes(path) && session === "guest" && !seen && storageOk && (!e2e || force);
    const env = { path, session, seen, force, storageOk, rm: false };
    expect(decide(env, splashConfig(e2e))).toBe(want);
  });

  it("covers 288 combinations, 6 of them true", () => {
    expect(cases).toHaveLength(288);
    const on = cases.filter(
      (c) => !AUTH.includes(c.path) && c.session === "guest" && !c.seen && c.storageOk && (!c.e2e || c.force),
    );
    expect(on).toHaveLength(6);
  });

  it("treats nested auth paths as auth routes, and a lookalike prefix as not", () => {
    const env = { path: "/", session: "guest", seen: false, force: false, storageOk: true, rm: false };
    expect(decide({ ...env, path: "/onboarding/step" }, cfg)).toBe(false);
    expect(decide({ ...env, path: "/welcomex" }, cfg)).toBe(true);
  });
});

describe("splashConfig", () => {
  it("uses the one AUTH_ROUTES list from the session module", () => {
    expect(cfg.authRoutes).toBe(AUTH_ROUTES);
  });
});
