import { test, expect, type Page } from "@playwright/test";

// TASK-79.7 · TC-75.43/44: the North Star Metric section on Home — above the
// task feed, carrying the literal Simulated label, an independent error
// state, and no horizontal scroll at 375px and 768px.

const LABEL = "Simulated — one demo session = one analyst-week";

async function openHome(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
}

test("TC-75.44: the NSM section sits between the KPI strip and the task feed, with heading, figure and label", async ({ page }) => {
  await openHome(page);
  const nsm = page.getByTestId("home-nsm");
  await expect(nsm).toBeVisible();
  await expect(nsm.getByRole("heading", { level: 2, name: "North Star Metric" })).toBeVisible();
  await expect(page.getByTestId("home-nsm-value")).toHaveText(/^₹[\d,]+\.\d{2}$/);
  await expect(page.getByTestId("home-nsm-label")).toContainText(LABEL);

  const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
  expect(await y("kpi-strip")).toBeLessThan(await y("home-nsm"));
  expect(await y("home-nsm")).toBeLessThan(await y("task-feed"));
});

test("TC-75.44: a forced NSM error stays inside its block; the rest of Home still renders", async ({ page }) => {
  await openHome(page, "/?__block_error=nsm");
  const nsm = page.getByTestId("home-block-nsm");
  await expect(nsm.getByRole("alert")).toContainText("Couldn’t compute the North Star Metric.");
  await expect(nsm.getByTestId("home-nsm-label")).toContainText(LABEL);
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  await expect(page.getByTestId("task-feed")).toBeVisible();
});

for (const width of [375, 768]) {
  test(`TC-75.44: no horizontal scroll at ${width}px with the NSM section`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openHome(page);
    await expect(page.getByTestId("home-nsm")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId("home-nsm").screenshot({ path: test.info().outputPath(`home-nsm-${width}.png`) });
  });
}
