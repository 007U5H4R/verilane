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

    const filterTimings: number[] = [];
    for (let i = 0; i < 5; i++) {
      await searchbox.fill("");
      await resultCount.waitFor();
      const q = i % 2 === 0 ? "INV" : "a";
      filterTimings.push(
        await timeInteraction(
          () => searchbox.fill(q),
          () => resultCount.waitFor(),
        ),
      );
    }
    await searchbox.fill("");

    const sortTimings: number[] = [];
    const columns = ["outstanding", "priority", "days_overdue", "priority"] as const;
    for (const column of columns) {
      sortTimings.push(
        await timeInteraction(
          () => sortSelect.selectOption(column).then(() => undefined),
          () => page.waitForURL(column === "priority" ? /queue(\?.*)?$/ : new RegExp(`sort=${column}`)),
        ),
      );
    }

    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const filterMedian = median(filterTimings);
    const sortMedian = median(sortTimings);
    save(`TC-085-queue-interaction-${testInfo.project.name}`, {
      budgetMs: INTERACTION_BUDGET_MS,
      filterTimings,
      filterMedian,
      sortTimings,
      sortMedian,
    });

    expect(filterMedian).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
    expect(sortMedian).toBeLessThanOrEqual(INTERACTION_BUDGET_MS);
  });
});
