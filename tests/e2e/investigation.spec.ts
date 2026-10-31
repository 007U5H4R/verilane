import { test, expect, type Page } from "@playwright/test";

// TASK-12.6 · Communication evidence on the Investigation page.
// E-007 cites INV-1042 (invoice_id INV-042): "paid ₹3,00,000 on 27/10/2026".
// INV-1013 (INV-B) is cited by no email in the seed.

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

test("TC-025: an email's extracted amount shows its class and provenance, labelled Simulated", async ({
  page,
}, testInfo) => {
  const errors = trackConsoleErrors(page);
  await openInvoice(page, "INV-042");

  const comms = page.locator('section[aria-labelledby="ev-communication"]');
  const message = comms.locator('[data-testid="communication-message"][data-thread="E-007"]');
  await expect(message).toBeVisible();
  await expect(message.getByTestId("email-class")).toHaveText("Payment claimed");
  await expect(comms.getByTestId("simulated-label")).toHaveText("Simulated");

  const amount = message.locator('tr[data-field="amounts[0]"]');
  await expect(amount).toContainText("₹3,00,000");
  await expect(amount.getByTestId("provenance")).toHaveText("emails.json · E-007 · amounts[0]");
  await expect(
    message.locator('tr[data-field="invoice_refs[0]"]').getByTestId("provenance"),
  ).toHaveText("emails.json · E-007 · invoice_refs[0]");

  await page.screenshot({ path: testInfo.outputPath("tc-025-communication.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("TC-026: an invoice no email cites shows 'No prior communication' and claims no contact", async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);
  await openInvoice(page, "INV-B");

  const comms = page.locator('section[aria-labelledby="ev-communication"]');
  await expect(comms.getByTestId("no-communication")).toHaveText("No prior communication");
  await expect(comms.getByTestId("communication-message")).toHaveCount(0);
  await expect(comms.getByTestId("simulated-label")).toHaveCount(0);

  await expect(page.getByTestId("priority-reason")).not.toHaveText(
    /contact|replied|reply|emailed|spoke|promised|responded/i,
  );
  expect(errors).toEqual([]);
});
