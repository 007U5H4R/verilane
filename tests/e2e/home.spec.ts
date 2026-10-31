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
    const [invoices, priorities, payments, disputes] = await Promise.all([
      db.invoices.toArray(),
      db.priorities.toArray(),
      db.payments.toArray(),
      db.disputes.toArray(),
    ]);
    const paid = new Map<string, number>();
    for (const p of payments) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount_paise);
    const open = priorities.filter((p) => p.band !== "closed");
    const openIds = new Set(open.map((p) => p.invoice_id));
    const overdue = open.map((p) => p.days_overdue).filter((d): d is number => d !== null && d > 0);
    return {
      total: priorities.length,
      high: open.filter((p) => p.band === "high").length,
      outstandingPaise: invoices
        .filter((i) => openIds.has(i.invoice_id))
        .reduce((sum, i) => sum + i.amount_paise - (paid.get(i.invoice_id) ?? 0), 0),
      avgDaysOverdue: overdue.length === 0 ? null : Math.round(overdue.reduce((a, b) => a + b, 0) / overdue.length),
      openDisputes: disputes.filter((d) => d.status !== "resolved" && d.status !== "rejected").length,
    };
  });
}

/** Same shape as `formatInr` (src/domain/money.ts). */
const inr = (paise: number) =>
  `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100)}`;

/** The `(n)` count at the end of a chart fallback link's text. */
async function countIn(link: ReturnType<Page["getByRole"]>): Promise<number> {
  const text = (await link.textContent()) ?? "";
  const match = /\((\d+)\)\s*$/.exec(text);
  expect(match, `no "(n)" count in "${text}"`).not.toBeNull();
  return Number(match![1]);
}

/** The Queue's "{matched} of {total} shown" result count. */
async function queueMatched(page: Page): Promise<number> {
  const resultCount = page.getByTestId("result-count");
  await expect(resultCount).toHaveText(/^\d+ of \d+ shown$/);
  return Number(((await resultCount.textContent()) ?? "").split(" ")[0]);
}

test("TC-054: each KPI tile shows the stored seed's value", async ({ page }, testInfo) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.total === 0, "seed carries no invoices to assert against");

  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(page.getByTestId("kpi-outstanding-value")).toHaveText(inr(facts.outstandingPaise));
  await expect(page.getByTestId("kpi-high-value")).toHaveText(String(facts.high));
  await expect(page.getByTestId("kpi-disputes-value")).toHaveText(String(facts.openDisputes));
  await expect(page.getByTestId("kpi-avg-days-value")).toHaveText(
    facts.avgDaysOverdue === null ? "—" : String(facts.avgDaysOverdue),
  );
  // Same source as the sidebar Disputes badge, so the two always agree (T18-10).
  await expect(page.getByTestId("dispute-count")).toHaveText(String(facts.openDisputes));
  await page.screenshot({ path: `${REPORTS_DIR}/TASK-18-home-working-${testInfo.project.name}.png`, fullPage: true });
});

test("TC-055: every ageing fallback link opens the Queue filtered to exactly the invoices it counted", async ({
  page,
}) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.total === 0, "seed carries no invoices to assert against");

  const links = page.getByTestId("ageing-chart-fallback").getByRole("link");
  await expect(links).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const link = page.getByTestId("ageing-chart-fallback").getByRole("link").nth(i);
    const counted = await countIn(link);
    await expect(link).toHaveAttribute("href", /^\/queue\?.*ageing=/);
    await link.click();
    await expect(page).toHaveURL(/\/queue\?.*ageing=/);
    expect(await queueMatched(page)).toBe(counted);
    await openHome(page);
  }
});

test("TC-055: clicking an ageing bar opens the Queue with the bar's count", async ({ page }) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.total === 0, "seed carries no invoices to assert against");

  // Bars render in bucket order; pick the first non-empty one (empty buckets draw no rectangle).
  const fallback = page.getByTestId("ageing-chart-fallback").getByRole("link");
  const counts: number[] = [];
  for (let i = 0; i < 4; i++) counts.push(await countIn(fallback.nth(i)));
  const nonEmpty = counts.map((c, i) => ({ c, i })).filter((x) => x.c > 0);
  test.skip(nonEmpty.length === 0, "seed has no overdue open invoices");
  const bars = page.getByTestId("ageing-chart").locator(".recharts-bar-rectangle");
  await expect(bars).toHaveCount(nonEmpty.length);
  await bars.first().click();
  await expect(page).toHaveURL(/\/queue\?.*ageing=/);
  expect(await queueMatched(page)).toBe(nonEmpty[0]!.c);
});

test("TC-055: priority-mix fallback link, bar and legend item each open the Queue with that band's count", async ({
  page,
}) => {
  await openHome(page);
  const facts = await homeFacts(page);
  test.skip(facts.high === 0, "seed carries no high-priority invoices to assert against");

  // Fallback link.
  const link = page.getByTestId("priority-mix-fallback").getByRole("link", { name: /^High:/ });
  await expect(link).toHaveText(`High: ${facts.high}`);
  await expect(link).toHaveAttribute("href", /^\/queue\?.*band=high/);
  await link.click();
  await expect(page).toHaveURL(/\/queue\?.*band=high/);
  expect(await queueMatched(page)).toBe(facts.high);

  // Bar segment: High is the first stacked series.
  await openHome(page);
  await page.getByTestId("priority-mix-chart").locator(".recharts-bar-rectangle").first().click();
  await expect(page).toHaveURL(/\/queue\?.*band=high/);
  expect(await queueMatched(page)).toBe(facts.high);

  // Legend item.
  await openHome(page);
  await page.getByTestId("priority-mix-chart").locator(".recharts-legend-item", { hasText: "High" }).click();
  await expect(page).toHaveURL(/\/queue\?.*band=high/);
  expect(await queueMatched(page)).toBe(facts.high);
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
  await expect(page.getByTestId("task-feed")).toBeVisible();

  const mixBlock = page.getByTestId("home-block-mix");
  await expect(mixBlock.getByRole("alert")).toContainText("Couldn’t load the priority mix chart.");
  await expect(page.getByTestId("priority-mix-chart")).toHaveCount(0);
  await page.screenshot({
    path: `${REPORTS_DIR}/TASK-18-home-block-error-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("TC-056: a real aggregate throwing on bad stored data fails only its own block", async ({ page }) => {
  await openHome(page);
  // Corrupt one stored priority so `kpis()` itself throws while summing days
  // overdue (number + BigInt is a TypeError). The ageing/mix aggregates and
  // the feed never do arithmetic on days, and a unique score means `rank()`
  // never compares its days either, so only the KPI block should fail.
  const corrupted = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const priorities = await db.priorities.toArray();
    const scores = new Map<number, number>();
    for (const p of priorities) if (p.score != null) scores.set(p.score, (scores.get(p.score) ?? 0) + 1);
    const target = priorities.find(
      (p) => p.band === "high" && p.score != null && scores.get(p.score) === 1 && (p.days_overdue ?? 0) > 0,
    );
    if (!target) return null;
    await db.priorities.update(target.invoice_id, { days_overdue: BigInt(target.days_overdue!) as unknown as number });
    return target.invoice_id;
  });
  expect(corrupted, "seed must contain a unique-score open invoice for the BigInt isolation test").not.toBeNull();

  await expect(page.getByTestId("home-block-kpi").getByRole("alert")).toContainText("Couldn’t load the KPI strip.");
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(page.getByTestId("task-feed")).toBeVisible();
  await expect(page.getByTestId("ageing-chart")).toBeVisible();
  await expect(page.getByTestId("priority-mix-chart")).toBeVisible();
});
