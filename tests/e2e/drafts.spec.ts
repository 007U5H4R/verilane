import { test, expect, type Page } from "@playwright/test";

// TASK-15.5 · TC-045: the reminder draft, its nine checks and the action bar.
// Seed facts: INV-C fails only check 6 (No open dispute); INV-A passes all nine.

const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Seed via the Queue, then open one invoice. */
async function openInvoice(page: Page, invoiceId: string): Promise<void> {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
}

async function generate(page: Page): Promise<void> {
  await expect(page.getByTestId("next-step")).toContainText("Generate a reminder");
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("draft-body")).toBeVisible();
}

test("TC-045: a failing check is listed first with its fix, and blocks the one primary", async ({ page }, info) => {
  const errors = trackConsoleErrors(page);
  await openInvoice(page, "INV-C");

  // Before a draft: one primary, disabled, saying why inline.
  const bar = page.getByTestId("action-bar");
  await expect(bar.getByTestId("primary-action")).toHaveText("Submit for approval");
  await expect(bar.getByTestId("primary-reason")).toHaveText("Unavailable: Generate a draft first");

  await generate(page);
  await expect(page.getByTestId("draft-body").locator("mark").first()).toBeVisible();
  await expect(page.getByTestId("draft-panel")).toContainText("Simulated LLM");

  const checks = page.getByTestId("checks-panel");
  await expect(checks.getByTestId("checks-summary")).toHaveText("8 of 9 passed");
  const items = checks.locator("li");
  await expect(items).toHaveCount(9);
  await expect(items.first()).toHaveAttribute("data-testid", "check-failed");
  await expect(items.first()).toContainText("No open dispute");
  await expect(items.first().getByRole("link", { name: "Review disputes" })).toHaveAttribute("href", "/disputes");
  await expect(checks.getByTestId("check-passed")).toHaveCount(8);

  // Exactly one primary; secondaries are outline pills.
  const buttons = bar.getByRole("button");
  await expect(buttons).toHaveText(["Mark disputed", "Edit draft", "Submit for approval"]);
  const primary = bar.getByTestId("primary-action");
  await expect(primary).toHaveAttribute("aria-disabled", "true");
  await expect(bar.getByTestId("primary-reason")).toHaveText("Unavailable: 1 pre-approval check is failing");
  await expect(primary).toHaveAccessibleDescription("Unavailable: 1 pre-approval check is failing");
  // TASK-16: Mark disputed is wired to the disputes state machine.
  await expect(bar.getByRole("button", { name: "Mark disputed" })).toBeEnabled();

  await expect(page.getByTestId("next-step")).toContainText("No open dispute");

  // A forced click does nothing: the draft stays generated.
  // aria-disabled keeps it focusable, so Playwright needs force to click it.
  await primary.click({ force: true });
  await expect(page.getByTestId("checks-summary")).toHaveText("8 of 9 passed");
  const status = await page.evaluate(() =>
    window.__verilane?.db.drafts.where("invoice_id").equals("INV-C").first().then((d) => d?.status),
  );
  expect(status).toBe("generated");

  await page.screenshot({ path: `${SHOTS}/TASK-15-tc045-failing-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("TC-045: a clean draft submits for approval; a Manager sees Approve & send", async ({ page }, info) => {
  const errors = trackConsoleErrors(page);
  await openInvoice(page, "INV-A");
  await generate(page);

  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
  await expect(page.getByTestId("check-failed")).toHaveCount(0);
  await expect(page.getByTestId("next-step")).toContainText("Submit the reminder for approval");

  const bar = page.getByTestId("action-bar");
  const primary = bar.getByTestId("primary-action");
  await expect(primary).toHaveAttribute("aria-disabled", "false");
  await expect(bar.getByTestId("primary-reason")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/TASK-15-tc045-clean-${info.project.name}.png`, fullPage: true });

  await primary.click();
  await expect(bar.getByTestId("primary-reason")).toHaveText("Unavailable: Already submitted for approval");
  await expect(page.getByTestId("next-step")).toContainText("Waiting for");
  await expect(page.getByTestId("activity-row").first()).toContainText(/submit|valid/i);

  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Manager" }).click();
  await expect(primary).toHaveText("Approve & send");
  await expect(bar.getByRole("button", { name: /Submit for approval/ })).toHaveCount(0);
  // TASK-16: approval is wired, so the Manager's primary is live.
  await expect(primary).toHaveAttribute("aria-disabled", "false");
  await expect(page.getByTestId("next-step")).toContainText("Approve and send");

  await page.screenshot({ path: `${SHOTS}/TASK-15-tc045-manager-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("TC-045: editing the draft re-runs the checks", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await openInvoice(page, "INV-A");
  await generate(page);

  await page.getByTestId("action-bar").getByRole("button", { name: "Edit draft" }).click();
  const box = page.getByLabel(/Draft text/);
  await box.fill(`${await box.inputValue()}\nThis also covers INV-1048.`); // eval case D-018
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByTestId("checks-summary")).toHaveText("8 of 9 passed");
  const failed = page.getByTestId("check-failed");
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("footnoted");
  await expect(failed.getByRole("button", { name: "Edit draft" })).toBeVisible();
  expect(errors).toEqual([]);
});
