import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// TASK-45.6 · Reduced motion (TC-157–TC-159, Design §18): under
// prefers-reduced-motion, the splash is a static frame — D_rm 1 s, ceiling
// 5 s (both from t0), beat 0, and an instant cut straight to `done` (no
// `exit` fade). Preconditions and helpers mirror tests/e2e/splash.spec.ts.

const FORCE = "?__splash=1";

async function splashOn(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
      if (window.sessionStorage.getItem("e2e:splash-reset") === null) {
        window.sessionStorage.removeItem("verilane-splash-seen");
        window.sessionStorage.setItem("e2e:splash-reset", "1");
      }
    } catch {
      // Storage blocked: the splash stays off, and the spec fails loudly.
    }
  });
}

// Every value html[data-splash] takes, in order, from the first frame on: "exit"
// must never appear (instant cut). Init scripts can run before <html> exists
// (documentElement is null), so the observer watches the document itself:
// childList catches <html> being inserted, attributes catch every change.
async function recordSplashAttr(context: BrowserContext) {
  await context.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __splashSeen: string[] }).__splashSeen = seen;
    new MutationObserver(() => {
      const v = document.documentElement?.getAttribute("data-splash") ?? null;
      if (v !== null && seen[seen.length - 1] !== v) seen.push(v);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-splash"] });
  });
}
const splashSeen = (page: Page) => page.evaluate(() => (window as unknown as { __splashSeen: string[] }).__splashSeen);
const waitForSplash = (page: Page, state: string, timeout?: number) =>
  page.waitForFunction((s) => document.documentElement.dataset.splash === s, state, { timeout });
const sinceT0 = (page: Page) =>
  page.evaluate(() => performance.now() - (performance.getEntriesByName("splash:painted")[0]?.startTime ?? 0));
async function waitPastT0(page: Page, ms: number) {
  await page.waitForFunction(
    (target) => {
      const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime;
      return t0 !== undefined && performance.now() - t0 >= target;
    },
    ms,
  );
}
const markAt = (page: Page, name: string) =>
  page.evaluate((n) => performance.getEntriesByName(n)[0]?.startTime ?? null, name);
const appInert = (page: Page) =>
  page.evaluate(() => document.getElementById("verilane-app")?.hasAttribute("inert"));

test.beforeEach(async ({ context, page }) => {
  await context.route("**/seed/manifest.json", () => {});
  await splashOn(context);
  await recordSplashAttr(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("TC-157: zero running animations while the splash is shown", async ({ page }) => {
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitForSplash(page, "on", 5_000);
  const at100 = await page.evaluate(
    () => new Promise<number>((r) => setTimeout(() => r(document.getAnimations().filter((a) => a.playState === "running").length), 100)),
  );
  expect(at100).toBe(0);
  const at600 = await page.evaluate(
    () => new Promise<number>((r) => setTimeout(() => r(document.getAnimations().filter((a) => a.playState === "running").length), 600)),
  );
  expect(at600).toBe(0);
});

test("TC-158: run A, readiness fast: done at 1.0 s ± 150 ms, instant cut, bar visible from t0", async ({ page, context }) => {
  // Readiness within D_rm: unblock the manifest so "ready" lands well before 1 s.
  await context.unroute("**/seed/manifest.json");
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitForSplash(page, "on", 5_000);
  const barShown = await page.evaluate(() => document.querySelector("#verilane-splash [data-splash-bar]")?.getAttribute("data-splash-bar"));
  expect(barShown).toBe("shown");
  await waitForSplash(page, "done", 5_000);
  // Read the cut time from the marks, as run B does: wall clock after the
  // waitForFunction poll adds the poll + round-trip lag (seen +231 ms at load ~13).
  const [t0, exit, done] = await page.evaluate(() =>
    ["splash:painted", "splash:exit", "splash:done"].map((n) => performance.getEntriesByName(n)[0]?.startTime ?? null),
  );
  expect(t0).not.toBeNull();
  expect(exit).not.toBeNull();
  expect(done! - t0!).toBeGreaterThanOrEqual(1000 - 150);
  expect(done! - t0!).toBeLessThanOrEqual(1000 + 150);
  expect(done! - exit!).toBeLessThanOrEqual(50);
  // No opacity-transition fade: the `exit` attribute is never set.
  const seen = await splashSeen(page);
  expect(seen).toContain("on"); // the recorder is live, so "no exit" is not vacuous
  expect(seen).not.toContain("exit");
  expect(seen[seen.length - 1]).toBe("done");
});

test("TC-158: run B, readiness never arrives: done at 5.0 s ± 200 ms via the ceiling", async ({ page }) => {
  test.slow();
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitForSplash(page, "on", 5_000);
  await waitForSplash(page, "done", 10_000);
  const [t0, ceiling, exit, done] = await page.evaluate(() =>
    ["splash:painted", "splash:ceiling", "splash:exit", "splash:done"].map(
      (n) => performance.getEntriesByName(n)[0]?.startTime ?? null,
    ),
  );
  expect(ceiling).not.toBeNull();
  expect(Math.abs(exit! - t0! - 5000)).toBeLessThanOrEqual(200);
  // Instant cut: exit and done land in the same tick, not 300 ms apart.
  expect(done! - exit!).toBeLessThanOrEqual(50);
  const seen = await splashSeen(page);
  expect(seen).toContain("on"); // the recorder is live, so "no exit" is not vacuous
  expect(seen).not.toContain("exit");
  expect(seen[seen.length - 1]).toBe("done");
});

test("TC-159: skip still works under reduced motion", async ({ page }) => {
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitForSplash(page, "on", 5_000);
  await waitPastT0(page, 400);
  const before = await sinceT0(page);
  await page.keyboard.press("Escape");
  await waitForSplash(page, "done", 2_000);
  const after = await sinceT0(page);
  // The contract, in page time: done within 50 ms of the skip.
  const [skip, done] = await Promise.all([markAt(page, "splash:skip"), markAt(page, "splash:done")]);
  expect(skip).not.toBeNull();
  expect(done).not.toBeNull();
  expect(done! - skip!).toBeLessThanOrEqual(50);
  // Loose sanity bound only: wall clock includes the CDP round trips.
  expect(after - before).toBeLessThanOrEqual(500);
  expect(await appInert(page)).toBe(false);
});
