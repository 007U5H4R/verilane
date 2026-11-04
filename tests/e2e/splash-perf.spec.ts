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
