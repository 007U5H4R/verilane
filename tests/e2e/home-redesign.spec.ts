import { test, expect, type Page } from "@playwright/test";

// TASK-38 · Home Emerald restyle: header, KPI links, attention feed,
// the four forced states, no glass, and no horizontal scroll on a phone.

async function openHome(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
}

test("TASK-38: Home header carries one H1 and the as-of line", async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByTestId("home-as-of")).toHaveText(/^As of \d{1,2} \w{3} \d{4} · What needs your attention today\.$/);
});

test("TASK-38: each KPI tile links to the view that explains its number", async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId("kpi-outstanding")).toHaveAttribute("href", /^\/queue\?.*sort=outstanding/);
  await expect(page.getByTestId("kpi-high")).toHaveAttribute("href", /^\/queue\?.*band=high/);
  await expect(page.getByTestId("kpi-disputes")).toHaveAttribute("href", "/disputes");
  await expect(page.getByTestId("kpi-avg-days")).toHaveAttribute("href", /^\/queue\?.*sort=days_overdue/);

  await page.getByTestId("kpi-high").click();
  await expect(page).toHaveURL(/\/queue\?.*band=high/);
});

test("TASK-38: the four forced states render", async ({ page }) => {
  await page.goto("/?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");

  await page.goto("/?__state=empty");
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();

  await page.goto("/?__state=error");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t load the home page." })).toBeVisible();

  await openHome(page);
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  await expect(page.getByTestId("task-feed")).toBeVisible();
});

test("TASK-38: the payment-review feed group counts open payment reviews and links to Payments", async ({ page }) => {
  await openHome(page);
  const open = await page.evaluate(async () => {
    const rows = await window.__verilane!.db.exceptions.where("status").equals("open").toArray();
    return rows.filter((r) => r.kind === "uncertain_match" || r.kind === "reconciliation").length;
  });
  expect(open, "seed must carry open payment reviews").toBeGreaterThan(0);

  const group = page.getByTestId("feed-payments");
  await expect(group.locator("summary")).toHaveText(
    open === 1 ? "1 payment email needs review" : `${open} payment emails need review`,
  );
  await expect(group).not.toHaveAttribute("open", "");
  await group.locator("summary").click();
  await expect(group).toHaveAttribute("open", "");
  await expect(group.getByRole("link", { name: /^Review / }).first()).toBeVisible();

  const link = page.getByTestId("feed-payments-link");
  await expect(link).toHaveAttribute("href", "/payments");
  await link.click();
  await expect(page).toHaveURL(/\/payments$/);
});

test("TASK-38: Home main content uses no glass or blur", async ({ page }) => {
  await openHome(page);
  const blurred = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter((el) => {
      const s = getComputedStyle(el);
      return (s.backdropFilter && s.backdropFilter !== "none") || /glass/i.test(el.className.toString());
    }).length,
  );
  expect(blurred).toBe(0);
});

test.describe("TASK-38: phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Home has no horizontal scroll at 390px", async ({ page }) => {
    await openHome(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
