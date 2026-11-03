import { test, expect, type Page } from "@playwright/test";

// TASK-38 · /invoices register: render, the four screen states (forced with
// the E2E-only `?__state=` override), the customer deep-link chip, and
// filter + sort. Counts are read from the stored seed, not hard-coded.

const PAGE_SIZE = 25;
const rows = (page: Page) => page.getByTestId("invoice-row");

async function open(page: Page, path = "/invoices") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
}

async function seedFacts(page: Page) {
  return page.evaluate(async () => {
    const db = window.__verilane!.db;
    const [invoices, customers] = await Promise.all([db.invoices.toArray(), db.customers.toArray()]);
    const byCustomer = customers
      .map((c) => ({ id: c.customer_id, name: c.name, count: invoices.filter((i) => i.customer_id === c.customer_id).length }))
      .filter((c) => c.count > 0 && c.name)
      .sort((a, b) => b.count - a.count);
    return {
      total: invoices.length,
      open: invoices.filter((i) => i.status === "open").length,
      top: byCustomer[0]!,
    };
  });
}

test("TASK-38: /invoices renders the full register with KPIs and a single H1", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invoices");
  await expect(page.locator("h1")).toHaveCount(1);
  const facts = await seedFacts(page);
  await expect(page.getByTestId("invoices-subtitle")).toContainText(`${facts.total} invoices`);
  for (const k of ["outstanding", "overdue", "disputed", "closed"]) {
    await expect(page.getByTestId(`invoices-kpi-${k}`)).toBeVisible();
  }
  await expect(rows(page)).toHaveCount(Math.min(PAGE_SIZE, facts.total));
  await expect(page.getByTestId("invoices-count")).toHaveText(`${facts.total} invoices`);
  // Days overdue is never rendered as 0.
  const overdue = await page.getByTestId("invoice-overdue").allInnerTexts();
  expect(overdue.some((t) => /^0 days$/.test(t.trim()))).toBe(false);
});

test("TASK-38: /invoices renders loading, empty, error and working states", async ({ page }) => {
  await open(page, "/invoices?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toBeVisible();

  await open(page, "/invoices?__state=empty");
  await expect(page.locator('[data-state="empty"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Load demo data" })).toBeVisible();

  await open(page, "/invoices?__state=error");
  // Scoped: Next's route announcer is also role=alert.
  await expect(page.locator('[role="alert"][data-state="error"]')).toContainText("Couldn’t load the invoices.");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await open(page);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
});

test("TASK-38: ?customer= deep link shows a removable chip naming the customer", async ({ page }) => {
  await open(page);
  const { top, total } = await seedFacts(page);
  await open(page, `/invoices?customer=${encodeURIComponent(top.id)}`);
  const chip = page.getByTestId("invoices-customer-chip");
  await expect(chip).toContainText(top.name!);
  await expect(rows(page)).toHaveCount(Math.min(PAGE_SIZE, top.count));
  await expect(page.getByTestId("invoices-count")).toHaveText(`${top.count} of ${total} invoices`);

  await chip.getByRole("button", { name: `Remove customer filter: ${top.name}` }).click();
  await expect(chip).toHaveCount(0);
  await expect(page).not.toHaveURL(/customer=/);
  await expect(page.getByTestId("invoices-count")).toHaveText(`${total} invoices`);
});

test("TASK-38: status filter, sort and search drive the URL and the rows", async ({ page }) => {
  await open(page);
  const facts = await seedFacts(page);

  await page.getByLabel("Status").selectOption("open");
  await expect(page).toHaveURL(/status=open/);
  await expect(page.getByTestId("invoices-count")).toHaveText(`${facts.open} of ${facts.total} invoices`);

  await page.getByLabel("Sort by").selectOption("overdue.desc");
  await expect(page).toHaveURL(/sort=overdue/);
  await expect(page.locator('table[aria-label="Invoices"]')).toHaveAttribute("data-sort", "overdue.desc");
  const days = (await page.getByTestId("invoice-overdue").allInnerTexts())
    .map((t) => /^(\d+) days?$/.exec(t.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  expect(days.length).toBeGreaterThan(1);
  expect(days).toEqual([...days].sort((a, b) => b - a));

  await page.getByRole("searchbox", { name: "Search invoices" }).fill("zzzz-no-match");
  await expect(page.locator('[data-state="empty-filtered"]')).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByTestId("invoices-count")).toHaveText(`${facts.total} invoices`);
});
