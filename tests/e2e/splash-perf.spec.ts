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

/** The order-statistic CI of the median of PAIRS per-pair differences. */
function pairCi(diffs: number[]) {
  expect(diffs, "the CI's order statistics assume PAIRS differences").toHaveLength(PAIRS);
  const s = [...diffs].sort((a, b) => a - b);
  return { lo: s[CI_ORDER[0] - 1]!, hi: s[CI_ORDER[1] - 1]!, coverage: CI_COVERAGE };
}
const straddles = (ci: { lo: number; hi: number }) => ci.lo < BUDGET_MS && BUDGET_MS < ci.hi;

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
    ci = pairCi(diffs);
  }
  // R-5: the CI straddling the budget means this run cannot call the gate either way.
  const inconclusive = ci ? straddles(ci) : null;
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
// scripts come from the Long Animation Frames API. Chromium reports
// sourceCharPosition 0 for every inline document script, so a long script
// cannot be pinned to the splash runtime by offset (the R-3 control showed
// this, EXE113). The gate is therefore stricter: no inline document script
// (the splash runtime, the theme script, Next's payload) may run above 50 ms.
// The "TC-169 control" test below proves the gate sees an injected loop.
const TC169_RUNS = 5;
const LONG_MS = 50;
const INP_MS = 200;

type LongScript = { dur: number; url: string; invoker: string; invokerType: string; fn: string; pos: number };
type Tc169Run = {
  // Every LoAF script entry above LONG_MS, attributed or not (R-3).
  rawLong: LongScript[];
  // Long scripts whose source is the document itself (inline scripts).
  inlineLong: LongScript[];
  longTasks: number[];
  // Every layout shift from splash:exit on, hadRecentInput or not (R-4).
  rawShiftsAfterExit: number;
  shiftsAfterExit: number;
  shiftSourcesAfterExit: string[];
  clsTotal: number;
  skipInteraction: number | null;
  skipPhases: { name: string; duration: number; inputDelay: number; processing: number; presentation: number } | null;
  firstInput: number | null;
};

type Tc169Opts = {
  // false: no key press; the splash exits on its own after D (R-4).
  skip?: boolean;
  // Rewrites the served /queue HTML (the R-3 control).
  transform?: (html: string) => string;
};

async function tc169Run(browser: Browser, { skip = true, transform }: Tc169Opts = {}): Promise<Tc169Run> {
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
  if (transform) {
    await context.route(
      (u) => u.pathname === "/queue",
      async (route) => {
        if (!route.request().isNavigationRequest()) return route.continue();
        const res = await route.fetch();
        const body = transform(await res.text());
        const headers = { ...res.headers() };
        delete headers["content-length"];
        delete headers["content-encoding"];
        await route.fulfill({ status: res.status(), headers, body });
      },
    );
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/queue?__splash=1", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => document.documentElement.dataset.splash)).toBe("on");
  if (skip) {
    // Past the 250 ms start guard and well into the cinematic, then one skip.
    await page.waitForFunction(() => {
      const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime;
      return t0 !== undefined && performance.now() - t0 >= 1500;
    });
    await page.keyboard.press("Escape");
  }
  await page.waitForFunction(() => document.documentElement.dataset.splash === "done", null, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  const run = await page.evaluate(
    ({ LONG }) => {
      type Script = { duration: number; sourceURL: string; invoker: string; invokerType: string; sourceFunctionName: string; sourceCharPosition: number };
      const rec = (window as unknown as { __perf: Record<string, (PerformanceEntry & Record<string, unknown>)[]> }).__perf;
      const doc = location.origin + location.pathname;
      const rawLong: LongScript[] = [];
      const inlineLong: LongScript[] = [];
      for (const f of rec.loaf!) {
        for (const s of (f.scripts as Script[] | undefined) ?? []) {
          if (s.duration <= LONG) continue;
          const entry = { dur: s.duration, url: s.sourceURL, invoker: s.invoker, invokerType: s.invokerType, fn: s.sourceFunctionName, pos: s.sourceCharPosition };
          rawLong.push(entry);
          if ((s.sourceURL || "").split("?")[0] === doc) inlineLong.push(entry);
        }
      }
      const exitAt = performance.getEntriesByName("splash:exit")[0]?.startTime ?? Infinity;
      const after = rec.shift!.filter((e) => e.startTime >= exitAt);
      const shifts = rec.shift!.filter((e) => !(e.hadRecentInput as boolean));
      const sum = (xs: typeof shifts) => xs.reduce((a, e) => a + (e.value as number), 0);
      const describe = (n: Node | null) => {
        if (!n) return "?";
        const el = n as Element;
        return `${n.nodeName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : ""}`;
      };
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
        rawLong,
        inlineLong,
        longTasks: rec.long!.map((e) => Math.round(e.duration)),
        rawShiftsAfterExit: sum(after),
        shiftsAfterExit: sum(after.filter((e) => !(e.hadRecentInput as boolean))),
        shiftSourcesAfterExit: after.flatMap((e) =>
          ((e.sources as { node: Node | null }[] | undefined) ?? []).map((src) => `${(e.value as number).toFixed(4)} ${describe(src.node)}`),
        ),
        clsTotal: sum(shifts),
        skipInteraction: inter.length ? Math.max(...inter) : null,
        skipPhases: phases,
        firstInput: rec.first![0] ? rec.first![0].duration : null,
      };
    },
    { LONG: LONG_MS },
  );
  await context.close();
  return run;
}

test("TC-169: splash-on INP, CLS at exit and long tasks under 4× CPU throttle @splash-perf", async ({ browser }, testInfo) => {
  test.setTimeout(8 * 60_000);
  // R-5: one discarded warm-up run, so a cold server or browser start is not
  // measured as the skip's latency.
  await tc169Run(browser);
  const runs: Tc169Run[] = [];
  for (let i = 0; i < TC169_RUNS; i++) runs.push(await tc169Run(browser));
  // R-4: one run where the splash leaves on its own, with no input to mask a shift.
  const natural = await tc169Run(browser, { skip: false });
  // The skip's latency: the slowest event of its interaction, or first-input
  // when every event beat the 16 ms observer threshold. Null means no input
  // was observed at all, which fails below rather than counting as 0 ms.
  const inp = runs.map((r) => r.skipInteraction ?? r.firstInput);
  const observed = inp.filter((v): v is number => v !== null);
  const result = { project: testInfo.project.name, cpuThrottle: 4, runs, natural, inp, medianInp: observed.length ? median(observed) : null, at: new Date().toISOString() };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/tc-169-${testInfo.project.name}-${Date.now()}.json`, JSON.stringify(result, null, 2));
  const all = [...runs, natural];
  console.log(
    `TC-169 ${JSON.stringify({
      inp,
      medianInp: result.medianInp,
      rawLong: all.map((r) => r.rawLong),
      inlineLong: all.map((r) => r.inlineLong),
      skipPhases: runs.map((r) => r.skipPhases),
      longTasks: all.map((r) => r.longTasks),
      rawShiftsAfterExit: all.map((r) => r.rawShiftsAfterExit),
      shiftsAfterExit: all.map((r) => r.shiftsAfterExit),
      shiftSourcesAfterExit: all.map((r) => r.shiftSourcesAfterExit),
      clsTotal: all.map((r) => r.clsTotal),
    })}`,
  );
  for (const r of all) {
    expect(r.inlineLong, "no inline document script (splash runtime included) above 50 ms").toEqual([]);
    // Raw: a shift caused by the exit lands inside the key press's
    // hadRecentInput window, so the filtered sum alone cannot see it (R-4).
    expect(r.rawShiftsAfterExit, `CLS from the exit (${r.shiftSourcesAfterExit.join(", ")})`).toBe(0);
  }
  for (const v of inp) expect(v, "an interaction was observed for the skip").not.toBeNull();
  expect(median(observed)).toBeLessThanOrEqual(INP_MS);
});

// R-3 control: a 120 ms busy loop at the start of the splash's inline script,
// and the same loop in its own inline script right after it, must both show up
// in inlineLong. Without this, an empty inlineLong could mean the filter never
// matches rather than that the inline scripts are fast. Both report
// sourceCharPosition 0, which is why the gate cannot single out the splash.
const BUSY = "(function(){var t=performance.now()+120;while(performance.now()<t){}})();";

function injectBusy(html: string) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const body = m[1]!;
    if (body.includes("__next_f") || !body.includes("splash:painted")) continue;
    const open = m.index + "<script>".length;
    const close = m.index + m[0].length;
    return html.slice(0, open) + BUSY + body + "</script><script>" + BUSY + "</script>" + html.slice(close);
  }
  throw new Error("no inline splash script in the served HTML");
}

test("TC-169 control: busy loops in and after the splash script are caught by the inline-script gate @splash-perf", async ({ browser }) => {
  test.setTimeout(2 * 60_000);
  const r = await tc169Run(browser, { transform: injectBusy });
  console.log(`TC-169 control ${JSON.stringify({ rawLong: r.rawLong, inlineLong: r.inlineLong })}`);
  expect(r.inlineLong.filter((s) => s.dur >= 100), "both injected loops").toHaveLength(2);
});

// TASK-45.10 · TC-170: with the seen flag set (no splash), the branch against
// E1 (the commit TASK-45 was cut from), served separately at SPLASH_E1_URL.
// E1 has no readiness marks, so "ready" is when /queue's first invoice row is
// attached, read by the same observer on both sides (EXE108). It takes TC-130's
// pair count so the two share one CI method (R-1).
const TC170_PAIRS = PAIRS;
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
  test.setTimeout(25 * 60_000);
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
  const diffs = (k: keyof Omit<Cwv, "splash">) => branch.map((b, i) => b[k] - e1[i]![k]);
  const d = (k: keyof Omit<Cwv, "splash">) => median(diffs(k));
  // R-1: the median is the gate; the CI says whether this run can call it.
  const lcpCi = pairCi(diffs("lcp"));
  const readyCi = pairCi(diffs("ready"));
  const result = {
    project: testInfo.project.name,
    pairs: TC170_PAIRS,
    branch,
    e1,
    medians: {
      lcp: { branch: median(branch.map((r) => r.lcp)), e1: median(e1.map((r) => r.lcp)), pairDelta: d("lcp"), ci: lcpCi, inconclusive: straddles(lcpCi) },
      cls: { branch: median(branch.map((r) => r.cls)), e1: median(e1.map((r) => r.cls)), pairDelta: d("cls") },
      ready: { branch: median(branch.map((r) => r.ready)), e1: median(e1.map((r) => r.ready)), pairDelta: d("ready"), ci: readyCi, inconclusive: straddles(readyCi) },
    },
    at: new Date().toISOString(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/tc-170-${testInfo.project.name}-${Date.now()}.json`, JSON.stringify(result, null, 2));
  console.log(`TC-170 ${JSON.stringify(result.medians)}`);
  for (const [k, m] of [["lcp", result.medians.lcp], ["ready", result.medians.ready]] as const) {
    if (m.inconclusive) console.log(`TC-170 ${k} inconclusive: CI straddles +${BUDGET_MS} ms (${m.ci.lo.toFixed(1)}..${m.ci.hi.toFixed(1)})`);
  }
  for (const r of branch) expect(r.splash, "the seen flag keeps the splash off").toBe("none");
  expect(result.medians.lcp.pairDelta).toBeLessThanOrEqual(BUDGET_MS);
  expect(Math.abs(result.medians.cls.branch - result.medians.cls.e1), "CLS unchanged").toBeLessThan(0.001);
  expect(result.medians.ready.pairDelta).toBeLessThanOrEqual(BUDGET_MS);
});
