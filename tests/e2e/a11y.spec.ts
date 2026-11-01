import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// TASK-25.2 · TC-080: zero serious/critical axe violations on every route,
// in the light and dark projects, at desktop (1280) and phone (390) width.
// Supersedes responsive.spec.ts's R2 sweep (moved here so it runs once) and
// folds in the parked R21: /payments and the INV-042 Communication panel at 390.

const QA_DIR = "/Volumes/E Drive/Dev/.scratch/verilane-qa";

const STATIC_ROUTES = ["/", "/queue", "/disputes", "/payments", "/drafts", "/audit", "/settings", "/settings/eval"];
const INVESTIGATION = "/invoices/INV-042";
const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

async function open(page: Page, href: string): Promise<void> {
  await page.goto(href);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
  if (href === "/queue") await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();
  if (href.startsWith("/invoices/")) {
    await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
    // R21: the Communication panel has finished loading before axe runs.
    await expect(page.getByRole("region", { name: "Communication" })).toHaveAttribute("aria-busy", "false");
  }
  if (href.startsWith("/disputes/")) await expect(page.locator('[data-state="working"]')).toBeVisible();
}

test("TC-080: every route has no serious or critical axe violations at 1280 and 390", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await open(page, "/disputes");
  const firstDispute = await page.locator('main a[href^="/disputes/"]').first().getAttribute("href");
  expect(firstDispute, "seed has at least one dispute").toBeTruthy();
  const routes = [...STATIC_ROUTES, INVESTIGATION, firstDispute!];

  const found: string[] = [];
  const results: { route: string; width: number; violations: { id: string; impact: string | null | undefined; nodes: number }[] }[] = [];
  for (const vp of WIDTHS) {
    await page.setViewportSize(vp);
    for (const href of routes) {
      await open(page, href);
      const { violations } = await new AxeBuilder({ page }).analyze();
      results.push({
        route: href,
        width: vp.width,
        violations: violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      });
      for (const v of violations) {
        if (v.impact !== "serious" && v.impact !== "critical") continue;
        for (const n of v.nodes)
          found.push(`${href} @${vp.width} ${v.id} (${v.impact}) ${n.target.join(" ")}: ${n.any[0]?.message ?? ""}`);
      }
    }
  }

  try {
    mkdirSync(QA_DIR, { recursive: true });
    writeFileSync(`${QA_DIR}/TC-080-axe-${testInfo.project.name}.json`, JSON.stringify({ found, results }, null, 2));
  } catch {
    // Evidence is best-effort (the QA dir only exists on the dev machine).
  }
  expect(found).toEqual([]);
});

test("R21: /payments and the INV-042 Communication panel fit 390 without horizontal scroll", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const href of ["/payments", INVESTIGATION]) {
    await open(page, href);
    if (href === INVESTIGATION) await page.getByRole("region", { name: "Communication" }).scrollIntoViewIfNeeded();
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `${href} scrollWidth`).toBeLessThanOrEqual(innerWidth);
    if (testInfo.project.name === "chromium-light") {
      const name = href === INVESTIGATION ? "communication" : "payments";
      await page.screenshot({ path: `/Volumes/E Drive/Dev/.scratch/verilane/reports/TASK-25-390-${name}.png` });
    }
  }
});
