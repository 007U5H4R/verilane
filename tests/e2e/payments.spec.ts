import { test, expect, type Page } from "@playwright/test";

// TASK-13 · TC-034: the Payments page lists the ledger and every open
// reconciliation / unmatched item, each linking to its email and invoice,
// with all four screen states.
const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

async function openPayments(page: Page, path = "/payments") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
}

async function openItemCounts(page: Page) {
  return page.evaluate(async () => {
    const items = await window.__verilane!.db.reviewItems.where("status").equals("open").toArray();
    return {
      reconciliation: items.filter((r) => r.kind === "reconciliation").length,
      uncertain: items.filter((r) => r.kind === "uncertain_match").length,
      payments: await window.__verilane!.db.payments.count(),
    };
  });
}

test("TC-034: working state — ledger, reconciliation and unmatched items link to email and invoice", async ({ page }, testInfo) => {
  await openPayments(page);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  const counts = await openItemCounts(page);
  expect(counts.reconciliation).toBeGreaterThan(0);
  expect(counts.uncertain).toBeGreaterThan(0);

  const reconcile = page.getByRole("list", { name: "Needs reconciliation" }).getByTestId("review-item");
  const unmatched = page.getByRole("list", { name: "Unmatched emails" }).getByTestId("review-item");
  await expect(reconcile).toHaveCount(counts.reconciliation);
  await expect(unmatched).toHaveCount(counts.uncertain);
  await expect(page.getByTestId("ledger-row")).toHaveCount(counts.payments);

  // TC-030 on screen: E-007's ₹3,00,000 claim beside the ₹3,40,000 outstanding.
  const e007 = reconcile.and(page.locator('[data-message="E-007-1"]'));
  await expect(e007).toHaveCount(1);
  await expect(e007.getByTestId("email-amount")).toHaveText("₹3,00,000.00");
  await expect(e007.getByTestId("ledger-amount")).toHaveText("₹3,40,000.00");
  await expect(e007.getByRole("link", { name: "INV-1042" })).toHaveAttribute("href", "/invoices/INV-042");
  await expect(e007.getByRole("link", { name: "Open email E-007-1" })).toHaveAttribute(
    "href",
    "/invoices/INV-042#ev-communication",
  );

  // Every unmatched item names its email; any candidate invoice is a link.
  for (const item of await unmatched.all()) {
    await expect(item).toContainText(/E-\d{3}-\d/);
  }

  await page.screenshot({ path: `${REPORTS_DIR}/TASK-13-payments-${testInfo.project.name}.png`, fullPage: true });

  // The email link lands on the invoice's Communication evidence with that message.
  await e007.getByRole("link", { name: "Open email E-007-1" }).click();
  await expect(page).toHaveURL(/\/invoices\/INV-042#ev-communication$/);
  await expect(page.getByTestId("communication-message").and(page.locator('[data-thread="E-007"]'))).toBeVisible();
});

test("TC-034: loading, empty and error states", async ({ page }, testInfo) => {
  const shot = (name: string) =>
    page.screenshot({ path: `${REPORTS_DIR}/TASK-13-payments-${name}-${testInfo.project.name}.png`, fullPage: true });

  await page.goto("/payments?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");
  await shot("loading");

  await page.goto("/payments?__state=empty");
  await expect(page.getByRole("heading", { name: "No payments yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Load or import data" })).toHaveAttribute("href", "/settings#import");
  await shot("empty");

  await page.goto("/payments?__state=error");
  const alert = page.getByRole("alert").filter({ hasText: "Couldn’t load payments." });
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  await shot("error");

  // A real empty database shows the same empty state, pointing to Settings.
  await openPayments(page);
  await page.evaluate(async () => {
    const db = window.__verilane!.db;
    await Promise.all([db.invoices.clear(), db.priorities.clear(), db.payments.clear(), db.customers.clear()]);
  });
  await expect(page.getByRole("heading", { name: "No payments yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Load or import data" })).toHaveAttribute("href", "/settings#import");
});

test("TASK-13.5: excluded queue rows carry their cause on the badge", async ({ page }) => {
  await page.goto("/queue?band=disputed&sort=invoice_number");
  await page.waitForFunction(() => window.__verilane !== undefined);
  const reason = await page.evaluate(async () => (await window.__verilane!.db.priorities.get("INV-C"))?.reason);
  expect(reason).toBeTruthy();
  const row = page.locator('a[href="/invoices/INV-C"]');
  await expect(row.getByTestId("excluded-badge")).toHaveAttribute("data-band", "disputed");
  await expect(row.getByTestId("excluded-badge")).toHaveAttribute("title", reason!);
});
