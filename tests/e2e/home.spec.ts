import { test, expect, type Page } from "@playwright/test";

// TASK-18 (TKT-13) · Home: KPIs, task feed, two charts.
// TC-054: KPI strip values match the seed's domain aggregates.
// TC-055: chart bars/legend and their keyboard-reachable fallback links
//   deep-link into the matching filtered /queue view.
// TC-056: each block (KPI/feed/chart) fails independently, and the page
//   empty state reads "Nothing needs your attention" with no celebration.

const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

async function openHome(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
}

/** Facts the assertions are checked against, read from the stored seed. */
async function homeFacts(page: Page) {
  return page.evaluate(async () => {
    const db = window.__verilane!.db;
    const [priorities, payments] = await Promise.all([db.priorities.toArray(), db.payments.toArray()]);
    const paid = new Map<string, number>();
    for (const p of payments) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount_paise);
    const open = priorities.filter((p) => p.band !== "closed");
    return {
      total: priorities.length,
      high: open.filter((p) => p.band === "high").length,
      disputed: open.filter((p) => p.band === "disputed").length,
    };
  });
}

test("TC-054: KPI strip reflects the stored seed's high-priority and open-dispute counts", async ({
  page,
}, testInfo) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.total === 0, "seed carries no invoices to assert against");

  await expect(page.locator('[data-state="working"]')).toBeVisible();
  const kpi = page.getByTestId("kpi-strip");
  await expect(kpi).toContainText(String(facts.high));
  await expect(kpi).toContainText(String(facts.disputed));
  await page.screenshot({ path: `${REPORTS_DIR}/TASK-18-home-working-${testInfo.project.name}.png`, fullPage: true });
});

test("TC-055: ageing chart's fallback links deep-link into the matching filtered Queue", async ({ page }) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.total === 0, "seed carries no invoices to assert against");

  const link = page.getByTestId("ageing-chart-fallback").getByRole("link").first();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/queue\?.*ageing=/);
  await link.click();
  await expect(page).toHaveURL(/\/queue\?.*ageing=/);
});

test("TC-055: priority-mix chart's fallback links deep-link into the matching filtered Queue", async ({ page }) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.high === 0, "seed carries no high-priority invoices to assert against");

  const link = page.getByTestId("priority-mix-fallback").getByRole("link", { name: /^High:/ });
  await expect(link).toHaveAttribute("href", /^\/queue\?.*band=high/);
  await link.click();
  await expect(page).toHaveURL(/\/queue\?.*band=high/);
  await expect(page.getByRole("button", { name: "High", exact: true })).toBeVisible();
});

test("TC-055: task feed links into the matching filtered Queue", async ({ page }) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.high === 0, "seed carries no high-priority invoices to assert against");

  await page.getByTestId("feed-high").locator("summary").click();
  const link = page.getByTestId("feed-high-link");
  await expect(link).toHaveAttribute("href", /^\/queue\?.*band=high/);
  await link.click();
  await expect(page).toHaveURL(/\/queue\?.*band=high/);
});

test("TC-056: /home loading, empty and error states", async ({ page }, testInfo) => {
  const shot = (name: string) =>
    page.screenshot({ path: `${REPORTS_DIR}/TASK-18-home-${name}-${testInfo.project.name}.png`, fullPage: true });

  await page.goto("/?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");
  await shot("loading");

  await page.goto("/?__state=empty");
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();
  await expect(page.getByText(/congrat/i)).toHaveCount(0);
  await shot("empty");

  await page.goto("/?__state=error");
  const alert = page.getByRole("alert").filter({ hasText: "Couldn’t load the home page." });
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  await shot("error");
});

test("TC-056: a single failing block shows an inline error while the rest of Home still renders", async ({
  page,
}, testInfo) => {
  await openHome(page, "/?__block_error=mix");
  const facts = await homeFacts(page);
  test.skip(facts.total === 0, "seed carries no invoices to assert against");

  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  await expect(page.getByTestId("ageing-chart")).toBeVisible();

  const mixBlock = page.getByTestId("home-block-mix");
  await expect(mixBlock.getByRole("alert")).toContainText("Couldn’t load the priority mix chart.");
  await expect(page.getByTestId("priority-mix-chart")).toHaveCount(0);
  await page.screenshot({
    path: `${REPORTS_DIR}/TASK-18-home-block-error-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
