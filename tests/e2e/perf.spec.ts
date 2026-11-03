import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

// TASK-25.5 · TC-083/TC-085 (production build, local): LCP ≤2.5s on `/` and
// `/queue`, and Queue filter/sort event-to-paint ≤200ms. @perf, run against
// `build:e2e` on E2E_PORT=3109 like the rest of this suite. The route-budget
// (First Load JS gzip) half of TC-083 is `scripts/route-budget.ts`, run
// separately against the plain production build (it measures shipped bytes,
// not a running page). TC-084 (recompute ≤200ms) is `src/store/perf.test.ts`.

const QA_DIR = "/Volumes/E Drive/Dev/.scratch/verilane-qa";
const LCP_BUDGET_MS = 2500;
const INTERACTION_BUDGET_MS = 200;

function save(name: string, data: unknown): void {
  try {
    mkdirSync(QA_DIR, { recursive: true });
    writeFileSync(`${QA_DIR}/${name}.json`, JSON.stringify(data, null, 2));
  } catch {
    // Evidence is best-effort (the QA dir only exists on the dev machine).
  }
}

/** Largest Contentful Paint observed up to the first user interaction (per spec, it stops there). */
async function measureLcp(page: Page, href: string): Promise<number> {
  await page.goto(href);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
  // Let the page settle (images, fonts) so the LCP candidate has finished.
  await page.waitForLoadState("load");
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let latest = 0;
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) latest = entry.startTime;
        });
        po.observe({ type: "largest-contentful-paint", buffered: true });
        // LCP entries stop arriving once painted; a short settle window is enough.
        setTimeout(() => {
          po.disconnect();
          resolve(latest);
        }, 500);
      }),
  );
  return lcp;
}

test.describe("@perf", () => {
  for (const href of ["/", "/queue"] as const) {
    test(`TC-083: LCP on ${href} is ≤${LCP_BUDGET_MS}ms`, async ({ page }, testInfo) => {
      const lcpMs = await measureLcp(page, href);
      save(`TC-083-lcp-${href === "/" ? "home" : "queue"}-${testInfo.project.name}`, { href, lcpMs, budgetMs: LCP_BUDGET_MS });
      expect(lcpMs).toBeGreaterThan(0);
      expect(lcpMs).toBeLessThanOrEqual(LCP_BUDGET_MS);
    });
  }

  test("TC-085: Queue filter and sort are each ≤200ms event-to-paint (median of 5)", async ({ page }, testInfo) => {
    await page.goto("/queue");
    await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
    await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();

    const searchbox = page.getByRole("searchbox", { name: "Search customers or invoices" });
    const resultCount = page.getByTestId("result-count");
    const sortSelect = page.getByRole("combobox", { name: "Sort by" });

    // Event Timing API (what TC-085 names): browser-measured input → next
    // paint for trusted events. Playwright's fill() goes through CDP text
    // insertion (trusted, so recorded); selectOption() dispatches synthetic
    // events (not recorded), so sort relies on the wall-clock bound below,
    // which over-counts by the Playwright round trips and is the stricter one.
    await page.evaluate(() => {
      const w = window as unknown as { __eventTimings: { name: string; duration: number }[] };
      w.__eventTimings = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__eventTimings.push({ name: e.name, duration: e.duration });
      }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    });

    async function timeInteraction(act: () => Promise<void>, settle: () => Promise<void>): Promise<number> {
      await page.evaluate(() => performance.clearMeasures());
      const t0 = await page.evaluate(() => performance.now());
      await act();
      await settle();
      // One rAF to capture the paint that followed the DOM update.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const t1 = await page.evaluate(() => performance.now());
      return t1 - t0;
    }

    // Settle = the committed result is on screen, checked every animation
    // frame in the page (no Playwright polling gap): the URL carries the new
    // state AND the list itself changed (T25-1). The search box and sort select
    // update the URL via router.replace/push and the list only re-renders after
    // that transition commits, so waiting on the input alone would measure
    // nothing.
    const ROWS = 'main a[href^="/invoices/"]';
    const rowOrder = () => page.$$eval(ROWS, (as) => as.map((a) => a.getAttribute("href")).join("|"));
    const fullCount = (await resultCount.textContent()) ?? "";

    // Queries that narrow the list: real customer names from the facet options.
    // TASK-38: the customer facet is a searchable picker, so its options exist
    // only while it is open — open it, read the names, close it again.
    await page.getByRole("button", { name: /^Customer: / }).click();
    // The list loads on first open — wait for it before reading (allInnerTexts doesn't wait).
    await expect(page.getByRole("group", { name: "Customer" }).getByRole("button").first()).toBeVisible();
    const names = (await page.getByRole("group", { name: "Customer" }).getByRole("button").allInnerTexts())
      .map((n) => n.trim())
      .filter(Boolean);
    await page.keyboard.press("Escape");
    expect(names.length).toBeGreaterThan(0);

    const filterTimings: number[] = [];
    for (let i = 0; i < 5; i++) {
      const q = names[i % names.length]!;
      filterTimings.push(
        await timeInteraction(
          () => searchbox.fill(q),
          () =>
            page
              .waitForFunction(
                ({ q, full }) =>
                  new URLSearchParams(location.search).get("q") === q &&
                  document.querySelector('[data-testid="result-count"]')?.textContent !== full,
                { q, full: fullCount },
                { polling: "raf", timeout: 10_000 },
              )
              .then(() => undefined),
        ),
      );
      // Reset outside the timed window and wait for the full list to return.
      await searchbox.fill("");
      await expect(resultCount).toHaveText(fullCount);
      await expect(page).not.toHaveURL(/[?&]q=/);
    }

    // Each step changes the visible order; "priority" is the default, so it
    // drops `sort` from the URL rather than adding it (TC-006).
    const sortTimings: number[] = [];
    const columns = ["outstanding", "priority", "days_overdue", "priority", "outstanding"] as const;
    for (const column of columns) {
      const before = await rowOrder();
      sortTimings.push(
        await timeInteraction(
          () => sortSelect.selectOption(column).then(() => undefined),
          () =>
            page
              .waitForFunction(
                ({ column, before, rows }) => {
                  const sort = new URLSearchParams(location.search).get("sort");
                  const urlOk = column === "priority" ? sort === null : (sort ?? "").startsWith(column);
                  const order = [...document.querySelectorAll(rows)].map((a) => a.getAttribute("href")).join("|");
                  return urlOk && order !== before;
                },
                { column, before, rows: ROWS },
                { polling: "raf", timeout: 10_000 },
              )
              .then(() => undefined),
        ),
      );
    }

    // Let the observer flush the last entries.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    const eventTimings = await page.evaluate(
      () => (window as unknown as { __eventTimings: { name: string; duration: number }[] }).__eventTimings,
    );
    const eventMax = eventTimings.reduce((m, e) => Math.max(m, e.duration), 0);

    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const filterMedian = median(filterTimings);
    const sortMedian = median(sortTimings);
    save(`TC-085-queue-interaction-${testInfo.project.name}`, {
      budgetMs: INTERACTION_BUDGET_MS,
      filterTimings,
      filterMedian,
      sortTimings,
      sortMedian,
      eventTimingEntries: eventTimings,
      eventTimingMaxMs: eventMax,
    });

    expect(filterMedian).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
    expect(sortMedian).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
    // Every recorded event (≥16ms) also met the budget; entries <16ms are not recorded at all.
    expect(eventMax).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
  });
});
