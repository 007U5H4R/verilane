import { writeFileSync, mkdirSync } from "node:fs";

import { test, expect, type Browser } from "@playwright/test";

// TASK-45.2 · TC-130 (TP-45.h, S34): the splash must not delay readiness.
// Tagged @splash-perf, so `pnpm e2e` skips it (grepInvert in
// playwright.config.ts) and `pnpm e2e:splash-perf` runs it. Each run is a
// fresh context: a fresh profile seeds, the same path a first visit takes.

const RUNS = 9;
// Interleaved mode (a noisy machine) takes more pairs and judges the median of
// the per-pair differences, which cancels drift between pairs and ignores a
// lone stalled run (EXE45).
const PAIRS = 21;
// R-5: a distribution-free CI for that median, from order statistics 6 and 16
// of the 21 sorted per-pair differences: P(s6 < true median < s16) =
// Σ_{i=6..15} C(21,i)/2^21 = 97.34%. Reported only; the gate is the median.
const CI_ORDER = [6, 16] as const;
const CI_COVERAGE = 0.9734;
const BUDGET_MS = 50;
const OUT = "/Volumes/E Drive/Dev/.scratch/task45/perf";

async function readyAt(browser: Browser, splash: boolean): Promise<number> {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
    } catch {
      // the run fails below on a missing mark
    }
  });
  const page = await context.newPage();
  await page.goto(`/queue${splash ? "?__splash=1" : ""}`, { waitUntil: "domcontentloaded" });
  if (splash) expect(await page.evaluate(() => document.documentElement.dataset.splash)).toBe("on");
  await page.waitForFunction(() => performance.getEntriesByName("splash:ready").length > 0, null, { timeout: 30_000 });
  const t = await page.evaluate(() => performance.getEntriesByName("splash:ready")[0]!.startTime);
  await context.close();
  return t;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

test("TC-130: splash:ready is within 50 ms of the no-splash baseline @splash-perf", async ({ browser }, testInfo) => {
  test.setTimeout(10 * 60_000);
  // Warm the server's caches so the first measured run isn't a cold start.
  await readyAt(browser, false);

  const baseline: number[] = [];
  for (let i = 0; i < RUNS; i++) baseline.push(await readyAt(browser, false));
  const spread = (Math.max(...baseline) - Math.min(...baseline)) / 2;

  // ≤ ±50 ms: a simple A/B against the baseline; wider: interleave A/B pairs.
  // SPLASH_PERF_MODE=interleaved forces pairs (a re-check under CPU contention).
  const mode = process.env.SPLASH_PERF_MODE === "interleaved" || spread > BUDGET_MS ? "interleaved" : "simple";
  let off = baseline;
  const on: number[] = [];
  let delta: number;
  let ci: { lo: number; hi: number; coverage: number } | null = null;
  if (mode === "simple") {
    for (let i = 0; i < RUNS; i++) on.push(await readyAt(browser, true));
    delta = median(on) - median(off);
  } else {
    off = [];
    for (let i = 0; i < PAIRS; i++) {
      // Alternate which side runs first so neither always gets the warmer slot.
      if (i % 2 === 0) {
        off.push(await readyAt(browser, false));
        on.push(await readyAt(browser, true));
      } else {
        on.push(await readyAt(browser, true));
        off.push(await readyAt(browser, false));
      }
    }
    const diffs = on.map((t, i) => t - off[i]!);
    delta = median(diffs);
    const s = [...diffs].sort((a, b) => a - b);
    ci = { lo: s[CI_ORDER[0] - 1]!, hi: s[CI_ORDER[1] - 1]!, coverage: CI_COVERAGE };
  }
  // R-5: the CI straddling the budget means this run cannot call the gate either way.
  const inconclusive = ci ? ci.lo < BUDGET_MS && BUDGET_MS < ci.hi : null;
  const result = {
    project: testInfo.project.name,
    runs: mode === "simple" ? RUNS : PAIRS,
    baseline,
    spread,
    mode,
    off,
    on,
    medianOff: median(off),
    medianOn: median(on),
    // simple: median(on) - median(off); interleaved: median of per-pair (on - off).
    delta,
    // interleaved only: distribution-free CI of the per-pair median; null in simple mode.
    ci,
    // interleaved only: true when the CI straddles the budget; null in simple mode.
    inconclusive,
    at: new Date().toISOString(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/tc-130-${testInfo.project.name}-${Date.now()}.json`, JSON.stringify(result, null, 2));
  console.log(`TC-130 ${JSON.stringify({ spread, mode, medianOff: result.medianOff, medianOn: result.medianOn, delta, ci })}`);
  if (ci && inconclusive) {
    console.log(`TC-130 inconclusive: CI straddles +${BUDGET_MS} ms (${ci.lo.toFixed(1)}..${ci.hi.toFixed(1)})`);
  }
  expect(delta).toBeLessThanOrEqual(BUDGET_MS);
});

// TASK-45.10 · TC-169: splash-on performance under a 4× CPU throttle. Long
// tasks are attributed with the Long Animation Frames API: a script entry
// counts as the splash's when its sourceCharPosition falls inside the inline
// splash runtime's character range in the served HTML. Other long inline
// scripts (Next's payload, the theme script) are recorded, not failed (EXE109).
const TC169_RUNS = 3;
const LONG_MS = 50;
const INP_MS = 200;

type LongScript = { dur: number; invoker: string; invokerType: string; fn: string; pos: number };
type Tc169Run = {
  splashLong: LongScript[];
  otherInlineLong: LongScript[];
  splashRange: [number, number] | null;
  longTasks: number[];
  shiftsAfterExit: number;
  clsTotal: number;
  skipInteraction: number | null;
  skipPhases: { name: string; duration: number; inputDelay: number; processing: number; presentation: number } | null;
  firstInput: number | null;
};

async function tc169Run(browser: Browser): Promise<Tc169Run> {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
    } catch {
      // the run fails below on a missing mark
    }
    const rec = { loaf: [] as PerformanceEntry[], long: [] as PerformanceEntry[], shift: [] as PerformanceEntry[], event: [] as PerformanceEntry[], first: [] as PerformanceEntry[] };
    (window as unknown as { __perf: typeof rec }).__perf = rec;
    const watch = (type: string, into: PerformanceEntry[], extra: Record<string, unknown> = {}) => {
      try {
        new PerformanceObserver((l) => into.push(...l.getEntries())).observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      } catch {
        // unsupported entry type: that series stays empty and is reported
      }
    };
    watch("long-animation-frame", rec.loaf);
    watch("longtask", rec.long);
    watch("layout-shift", rec.shift);
    watch("event", rec.event, { durationThreshold: 16 });
    watch("first-input", rec.first);
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/queue?__splash=1", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => document.documentElement.dataset.splash)).toBe("on");
  // Past the 250 ms start guard and well into the cinematic, then one skip.
  await page.waitForFunction(() => {
    const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime;
    return t0 !== undefined && performance.now() - t0 >= 1500;
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.documentElement.dataset.splash === "done", null, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  // The served HTML, fetched outside the page so the measurement is untouched.
  const html = await (await page.request.get(page.url())).text();
  const run = await page.evaluate(
    ({ LONG, html }) => {
      type Script = { duration: number; sourceURL: string; invoker: string; invokerType: string; sourceFunctionName: string; sourceCharPosition: number };
      const rec = (window as unknown as { __perf: Record<string, (PerformanceEntry & Record<string, unknown>)[]> }).__perf;
      const doc = location.origin + location.pathname;
      // The splash runtime is the inline script that writes the splash marks
      // (Next's flight payload repeats its source as a string, so skip those).
      const text = Array.from(document.scripts).find((el) => !el.src && !el.text.includes("__next_f") && el.text.includes("splash:painted"))?.text ?? "";
      const at = text ? html.indexOf(text) : -1;
      const splashRange: [number, number] | null = at >= 0 ? [at, at + text.length] : null;
      const splashLong: { dur: number; invoker: string; invokerType: string; fn: string; pos: number }[] = [];
      const otherInlineLong: typeof splashLong = [];
      for (const f of rec.loaf!) {
        for (const s of (f.scripts as Script[] | undefined) ?? []) {
          const url = (s.sourceURL || "").split("?")[0]!;
          if (s.duration <= LONG || url !== doc) continue;
          const entry = { dur: s.duration, invoker: s.invoker, invokerType: s.invokerType, fn: s.sourceFunctionName, pos: s.sourceCharPosition };
          // An unknown range attributes every inline long script to the splash.
          const inSplash = !splashRange || (entry.pos >= splashRange[0] && entry.pos < splashRange[1]);
          (inSplash ? splashLong : otherInlineLong).push(entry);
        }
      }
      const exitAt = performance.getEntriesByName("splash:exit")[0]?.startTime ?? Infinity;
      const shifts = rec.shift!.filter((e) => !(e.hadRecentInput as boolean));
      const sum = (xs: typeof shifts) => xs.reduce((a, e) => a + (e.value as number), 0);
      const events = rec.event!.filter((e) => (e.interactionId as number) > 0);
      const inter = events.map((e) => e.duration);
      // The slowest event's phases: a long input delay means the main thread
      // was busy with other work when the key went down, not a slow handler.
      const worst = events.sort((a, b) => b.duration - a.duration)[0];
      const ps = worst ? (worst.processingStart as number) : 0;
      const pe = worst ? (worst.processingEnd as number) : 0;
      const phases = worst
        ? { name: worst.name, duration: worst.duration, inputDelay: ps - worst.startTime, processing: pe - ps, presentation: worst.startTime + worst.duration - pe }
        : null;
      return {
        splashLong,
        otherInlineLong,
        splashRange,
        longTasks: rec.long!.map((e) => Math.round(e.duration)),
        shiftsAfterExit: sum(shifts.filter((e) => e.startTime >= exitAt)),
        clsTotal: sum(shifts),
        skipInteraction: inter.length ? Math.max(...inter) : null,
        skipPhases: phases,
        firstInput: rec.first![0] ? rec.first![0].duration : null,
      };
    },
    { LONG: LONG_MS, html },
  );
  await context.close();
  return run;
}

test("TC-169: splash-on INP, CLS at exit and long tasks under 4× CPU throttle @splash-perf", async ({ browser }, testInfo) => {
  test.setTimeout(5 * 60_000);
  const runs: Tc169Run[] = [];
  for (let i = 0; i < TC169_RUNS; i++) runs.push(await tc169Run(browser));
  // The skip's latency: the slowest event of its interaction, or first-input
  // when every event beat the 16 ms observer threshold.
  const inp = runs.map((r) => r.skipInteraction ?? r.firstInput ?? 0);
  const result = { project: testInfo.project.name, cpuThrottle: 4, runs, inp, medianInp: median(inp), at: new Date().toISOString() };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/tc-169-${testInfo.project.name}-${Date.now()}.json`, JSON.stringify(result, null, 2));
  console.log(`TC-169 ${JSON.stringify({ inp, splashLong: runs.map((r) => r.splashLong), otherInlineLong: runs.map((r) => r.otherInlineLong), splashRange: runs.map((r) => r.splashRange), skipPhases: runs.map((r) => r.skipPhases), longTasks: runs.map((r) => r.longTasks), shiftsAfterExit: runs.map((r) => r.shiftsAfterExit), clsTotal: runs.map((r) => r.clsTotal) })}`);
  for (const r of runs) {
    expect(r.splashLong, "no splash-runtime script above 50 ms").toEqual([]);
    expect(r.shiftsAfterExit, "CLS from the exit").toBe(0);
  }
  expect(median(inp)).toBeLessThanOrEqual(INP_MS);
});

// TASK-45.10 · TC-170: with the seen flag set (no splash), the branch against
// E1 (the commit TASK-45 was cut from), served separately at SPLASH_E1_URL.
// E1 has no readiness marks, so "ready" is when /queue's first invoice row is
// attached, read by the same observer on both sides (EXE108).
const TC170_PAIRS = 11;
const E1_URL = process.env.SPLASH_E1_URL;

type Cwv = { lcp: number; cls: number; ready: number; splash: string };

async function cwv(browser: Browser, origin: string): Promise<Cwv> {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
      window.sessionStorage.setItem("verilane-splash-seen", "1");
    } catch {
      // the run fails below on a missing value
    }
    const rec = { lcp: 0, cls: 0, ready: 0 };
    (window as unknown as { __cwv: typeof rec }).__cwv = rec;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) rec.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) rec.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new MutationObserver((_, mo) => {
      if (document.querySelector('main a[href^="/invoices/"]')) {
        rec.ready = performance.now();
        mo.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  await page.goto(`${origin}/queue`, { waitUntil: "load" });
  await page.waitForFunction(() => (window as unknown as { __cwv: { ready: number } }).__cwv.ready > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  const out = await page.evaluate(() => ({
    ...(window as unknown as { __cwv: { lcp: number; cls: number; ready: number } }).__cwv,
    splash: document.documentElement.dataset.splash ?? "none",
  }));
  await context.close();
  return out;
}

test("TC-170: no-splash LCP, CLS and readiness unchanged against E1 @splash-perf", async ({ browser, baseURL }, testInfo) => {
  test.skip(!E1_URL, "set SPLASH_E1_URL to an E1 build's origin");
  test.setTimeout(15 * 60_000);
  // Warm both servers.
  await cwv(browser, baseURL!);
  await cwv(browser, E1_URL!);
  const branch: Cwv[] = [];
  const e1: Cwv[] = [];
  for (let i = 0; i < TC170_PAIRS; i++) {
    if (i % 2 === 0) {
      e1.push(await cwv(browser, E1_URL!));
      branch.push(await cwv(browser, baseURL!));
    } else {
      branch.push(await cwv(browser, baseURL!));
      e1.push(await cwv(browser, E1_URL!));
    }
  }
  const d = (k: keyof Omit<Cwv, "splash">) => median(branch.map((b, i) => b[k] - e1[i]![k]));
  const result = {
    project: testInfo.project.name,
    pairs: TC170_PAIRS,
    branch,
    e1,
    medians: {
      lcp: { branch: median(branch.map((r) => r.lcp)), e1: median(e1.map((r) => r.lcp)), pairDelta: d("lcp") },
      cls: { branch: median(branch.map((r) => r.cls)), e1: median(e1.map((r) => r.cls)), pairDelta: d("cls") },
      ready: { branch: median(branch.map((r) => r.ready)), e1: median(e1.map((r) => r.ready)), pairDelta: d("ready") },
    },
    at: new Date().toISOString(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/tc-170-${testInfo.project.name}-${Date.now()}.json`, JSON.stringify(result, null, 2));
  console.log(`TC-170 ${JSON.stringify(result.medians)}`);
  for (const r of branch) expect(r.splash, "the seen flag keeps the splash off").toBe("none");
  expect(result.medians.lcp.pairDelta).toBeLessThanOrEqual(BUDGET_MS);
  expect(Math.abs(result.medians.cls.branch - result.medians.cls.e1), "CLS unchanged").toBeLessThan(0.001);
  expect(result.medians.ready.pairDelta).toBeLessThanOrEqual(BUDGET_MS);
});
