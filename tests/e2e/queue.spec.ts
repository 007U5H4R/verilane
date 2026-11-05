import { test, expect, type Page } from "@playwright/test";

// TASK-9 · Queue search, filters, sort, paging and the four screen states.
// Counts are checked against the stored seed (window.__verilane.db), not
// hard-coded, so a seed bump doesn't break the spec.

const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";
const PAGE_SIZE = 25;

const rowsOf = (page: Page) => page.locator('a[href^="/invoices/"]');

async function openQueue(page: Page, path = "/queue") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
}

/** Facts the assertions are checked against, read from the stored seed. */
async function seedFacts(page: Page) {
  return page.evaluate(async () => {
    const db = window.__verilane!.db;
    const [invoices, priorities, customers, payments] = await Promise.all([
      db.invoices.toArray(),
      db.priorities.toArray(),
      db.customers.toArray(),
      db.payments.toArray(),
    ]);
    const paid = new Map<string, number>();
    for (const p of payments) if (p.invoice_id !== null) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount_paise);
    return {
      total: priorities.length,
      high: priorities.filter((p) => p.band === "high").length,
      customers: customers.map((c) => ({
        name: c.name,
        invoices: invoices.filter((i) => i.customer_id === c.customer_id).length,
      })),
      outstandingDesc: invoices
        .map((i) => i.amount_paise - (paid.get(i.invoice_id) ?? 0))
        .sort((a, b) => b - a),
    };
  });
}

async function shownIds(page: Page): Promise<string[]> {
  return (await rowsOf(page).evaluateAll((els) => els.map((a) => a.getAttribute("href") ?? ""))).map((h) =>
    decodeURIComponent(h.replace("/invoices/", "")),
  );
}

test("TC-015: search, band facet, sort by outstanding and page 2 match the seed", async ({ page }, testInfo) => {
  await openQueue(page);
  await expect(rowsOf(page)).toHaveCount(PAGE_SIZE);
  const facts = await seedFacts(page);
  const resultCount = page.getByTestId("result-count");
  await expect(resultCount).toHaveText(`${facts.total} of ${facts.total} shown`);
  await expect(page.getByTestId("active-filter-count")).toHaveCount(0);

  // Search a customer.
  const target = [...facts.customers].sort((a, b) => b.invoices - a.invoices)[0]!;
  await page.getByRole("searchbox", { name: "Search customers or invoices" }).fill(target.name);
  await expect(resultCount).toHaveText(`${target.invoices} of ${facts.total} shown`);
  await expect(rowsOf(page)).toHaveCount(target.invoices);
  for (const row of await rowsOf(page).all()) await expect(row).toContainText(target.name);
  await expect(page.getByTestId("active-filter-count")).toHaveText("(1)");
  await expect(page).toHaveURL(/[?&]q=/);

  // Clear, then band = High.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(resultCount).toHaveText(`${facts.total} of ${facts.total} shown`);
  await page.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High", exact: true }).click();
  await expect(page).toHaveURL(/band=high/);
  await expect(resultCount).toHaveText(`${facts.high} of ${facts.total} shown`);
  await expect(rowsOf(page)).toHaveCount(facts.high);
  await expect(page.getByTestId("active-filter-count")).toHaveText("(1)");
  await page.screenshot({ path: `${REPORTS_DIR}/TASK-9-queue-band-high-${testInfo.project.name}.png`, fullPage: true });

  // Sort by outstanding (desc) over everything, then page 2.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("outstanding");
  await expect(page).toHaveURL(/sort=outstanding/);
  await expect(page.getByRole("button", { name: /Sort direction: descending/ })).toHaveText("Descending");
  const pageCount = Math.ceil(facts.total / PAGE_SIZE);
  await expect(page.getByTestId("page-indicator")).toHaveText(`Page 1 of ${pageCount}`);
  await expect(rowsOf(page)).toHaveCount(PAGE_SIZE);
  const page1 = await shownIds(page);

  await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByTestId("page-indicator")).toHaveText(`Page 2 of ${pageCount}`);
  await expect(rowsOf(page)).toHaveCount(Math.min(PAGE_SIZE, facts.total - PAGE_SIZE));
  const page2 = await shownIds(page);
  expect(page1.filter((id) => page2.includes(id))).toEqual([]);

  // Outstanding is non-increasing across both pages and matches the seed.
  const outstandingById = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const [invoices, payments] = await Promise.all([db.invoices.toArray(), db.payments.toArray()]);
    const paid = new Map<string, number>();
    for (const p of payments) if (p.invoice_id !== null) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount_paise);
    return Object.fromEntries(invoices.map((i) => [i.invoice_id, i.amount_paise - (paid.get(i.invoice_id) ?? 0)]));
  });
  expect([...page1, ...page2].map((id) => outstandingById[id])).toEqual(facts.outstandingDesc);
});

test("TC-015: excluded bands stay in the queue, muted with a badge", async ({ page }, testInfo) => {
  await openQueue(page);
  await expect(rowsOf(page)).toHaveCount(PAGE_SIZE);
  const [first, second] = await shownIds(page);
  // The seed has disputed / promised rows (TASK-13); mark two more as excluded
  // and count the expected set from the db.
  await page.evaluate(
    async ([a, b]) => {
      const db = window.__verilane!.db;
      await db.priorities.update(a!, { band: "disputed" });
      await db.priorities.update(b!, { band: "on_hold_promised" });
    },
    [first, second],
  );
  const total = await page.evaluate(() => window.__verilane!.db.priorities.count());
  const excludedTotal = await page.evaluate(() =>
    window.__verilane!.db.priorities.where("band").anyOf("disputed", "on_hold_promised").count(),
  );
  expect(excludedTotal).toBeGreaterThanOrEqual(2);
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("invoice_number");
  await page.getByRole("group", { name: "Priority" }).getByRole("button", { name: "Disputed" }).click();
  await page.getByRole("group", { name: "Priority" }).getByRole("button", { name: /promised/i }).click();
  await expect(page).toHaveURL(/band=disputed,on_hold_promised/);

  const excluded = page.locator("a[data-excluded]");
  await expect(excluded).toHaveCount(Math.min(excludedTotal, PAGE_SIZE));
  await expect(excluded.getByTestId("excluded-badge")).toHaveCount(Math.min(excludedTotal, PAGE_SIZE));
  await expect(excluded.first().getByTestId("excluded-badge")).toContainText("excluded from queue");

  // Never removed: with the facets cleared they're still counted and listed.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("result-count")).toHaveText(`${total} of ${total} shown`);
  await expect(page.getByTestId("queue-count")).toHaveText(String(total));
  await page.screenshot({ path: `${REPORTS_DIR}/TASK-9-queue-excluded-${testInfo.project.name}.png`, fullPage: true });
});

test("TC-015: rapid facet toggles compose (no click is dropped)", async ({ page }) => {
  await openQueue(page);
  await expect(rowsOf(page)).toHaveCount(PAGE_SIZE);
  // Both clicks in one JS tick: the second runs before the first push re-renders.
  await page.evaluate(() => {
    const group = [...document.querySelectorAll('[role="group"]')].find((g) =>
      g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent === "Priority",
    )!;
    const pill = (label: string) => [...group.querySelectorAll("button")].find((b) => b.textContent === label)!;
    pill("High").click();
    pill("Medium").click();
  });
  await expect(page).toHaveURL(/band=high,medium/);
  const priority = page.getByRole("group", { name: "Priority" });
  await expect(priority.getByRole("button", { name: "High", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(priority.getByRole("button", { name: "Medium", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("TC-016: loading, empty, filtered-empty and error states", async ({ page, browser }, testInfo) => {
  const shot = (name: string) =>
    page.screenshot({ path: `${REPORTS_DIR}/TASK-9-state-${name}-${testInfo.project.name}.png`, fullPage: true });

  await page.goto("/queue?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toBeVisible();
  await expect(page.locator('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");
  await shot("loading");

  await page.goto("/queue?__state=empty");
  await expect(page.getByRole("heading", { name: "No invoices yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load demo data" })).toBeVisible();
  await shot("empty");

  // Filter with no matches → filtered-empty + Clear filters recovers.
  await openQueue(page, "/queue?q=zzz-no-such-customer");
  await expect(page.getByRole("heading", { name: "No invoices match these filters" })).toBeVisible();
  await shot("filtered-empty");
  await page.locator('[data-state="empty-filtered"]').getByRole("button", { name: "Clear filters" }).click();
  await expect(rowsOf(page)).toHaveCount(PAGE_SIZE);

  // A real empty database → "Load demo data" restores the rows.
  await page.evaluate(async () => {
    const db = window.__verilane!.db;
    await Promise.all([db.invoices.clear(), db.priorities.clear(), db.payments.clear(), db.customers.clear()]);
  });
  await expect(page.getByRole("heading", { name: "No invoices yet" })).toBeVisible();
  await page.getByRole("button", { name: "Load demo data" }).click();
  await expect(rowsOf(page)).toHaveCount(PAGE_SIZE);

  // Seed fetch 500 in a fresh context → error with Retry; Retry recovers once the fault clears.
  const ctx = await browser.newContext({ colorScheme: testInfo.project.use.colorScheme, serviceWorkers: "block" });
  const fresh = await ctx.newPage();
  await fresh.route("**/seed/**", (route) => route.fulfill({ status: 500, body: "boom" }));
  await fresh.goto("/queue");
  const alert = fresh.getByRole("alert").filter({ hasText: "Couldn’t load the queue." });
  await expect(alert).toBeVisible();
  await fresh.screenshot({ path: `${REPORTS_DIR}/TASK-9-state-error-${testInfo.project.name}.png`, fullPage: true });
  await fresh.unroute("**/seed/**");
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(rowsOf(fresh)).toHaveCount(PAGE_SIZE);
  await ctx.close();

  await page.goto("/queue?__state=error");
  await expect(page.getByRole("alert").getByRole("button", { name: "Retry" })).toBeVisible();
});

test("TC-017: reload, shared link and Back restore the queue view", async ({ page, browser }, testInfo) => {
  await openQueue(page, "/queue?sort=outstanding&page=2");
  await expect(page.getByTestId("page-indicator")).toHaveText(/^Page 2 of/);
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("outstanding");
  const before = await shownIds(page);
  expect(before).toHaveLength(PAGE_SIZE);

  await page.reload();
  await expect(page.getByTestId("page-indicator")).toHaveText(/^Page 2 of/);
  expect(await shownIds(page)).toEqual(before);

  // Shared link in a new context (its own fresh database).
  const ctx = await browser.newContext({ colorScheme: testInfo.project.use.colorScheme });
  const other = await ctx.newPage();
  await other.goto("/queue?band=high&sort=outstanding&page=2");
  await expect(other.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(other.getByRole("combobox", { name: "Sort by" })).toHaveValue("outstanding");
  await expect(other.getByTestId("active-filter-count")).toHaveText("(1)");
  // Only one page of High rows exists, so page 2 clamps to the last page.
  await expect(other.getByTestId("page-indicator")).toHaveText("Page 1 of 1");
  await ctx.close();

  // Back restores the previous filters.
  await page.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High", exact: true }).click();
  await expect(page).toHaveURL(/band=high/);
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 1");
  await page.goBack();
  await expect(page).not.toHaveURL(/band=/);
  await expect(page.getByTestId("page-indicator")).toHaveText(/^Page 2 of/);
  expect(await shownIds(page)).toEqual(before);
});
