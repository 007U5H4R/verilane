import { writeFileSync, mkdirSync } from "node:fs";

import { test, expect, type Browser } from "@playwright/test";

// TASK-45.2 · TC-130 (TP-45.h, S34): the splash must not delay readiness.
// Tagged @splash-perf, so `pnpm e2e` skips it (grepInvert in
// playwright.config.ts) and `pnpm e2e:splash-perf` runs it. Each run is a
// fresh context: a fresh profile seeds, the same path a first visit takes.

const RUNS = 9;
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
  if (mode === "simple") {
    for (let i = 0; i < RUNS; i++) on.push(await readyAt(browser, true));
  } else {
    off = [];
    for (let i = 0; i < RUNS; i++) {
      off.push(await readyAt(browser, false));
      on.push(await readyAt(browser, true));
    }
  }
  const delta = median(on) - median(off);
  const result = {
    project: testInfo.project.name,
    runs: RUNS,
    baseline,
    spread,
    mode,
    off,
    on,
    medianOff: median(off),
    medianOn: median(on),
    delta,
    at: new Date().toISOString(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/tc-130-${testInfo.project.name}-${Date.now()}.json`, JSON.stringify(result, null, 2));
  console.log(`TC-130 ${JSON.stringify({ spread, mode, medianOff: result.medianOff, medianOn: result.medianOn, delta })}`);
  expect(delta).toBeLessThanOrEqual(BUDGET_MS);
});
