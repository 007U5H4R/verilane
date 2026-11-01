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

// TASK-34 · R18: a G4/G5 reason cites `<message_id>:emails.json:email_class`;
// that id must exist on screen as an anchor with its provenance visible.
const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

test("R18: every email citation in a queue reason is a visible anchor with provenance", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackConsoleErrors(page);
  await page.goto("/queue");
  const rows = page.locator('main a[href^="/invoices/"]');
  await expect(rows.first()).toBeVisible();
  // Every queue row whose cause is an email class (G4/G7), plus INV-042 (G5,
  // held off the main list).
  const hrefs = await rows.filter({ hasText: ":emails.json:email_class" }).evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")!),
  );
  expect(hrefs.length, "the seed has queue rows citing an email class").toBeGreaterThan(0);

  for (const href of new Set([...hrefs, "/invoices/INV-042"])) {
    await openInvoice(page, href.split("/").pop()!);
    const reason = (await page.getByTestId("priority-reason").textContent()) ?? "";
    const cites = [...reason.matchAll(/\[([^\]]+:emails\.json:email_class)\]/g)].map((m) => m[1]!);
    expect(cites, `${href} reason cites an email: ${reason}`).not.toEqual([]);

    for (const cite of cites) {
      const anchor = page.locator(`[id="ev-${cite}"]`);
      await expect(anchor, `${href} anchor for ${cite}`).toBeVisible();
      await expect(anchor).toHaveAttribute("data-testid", "email-class");
      const message = page.getByTestId("communication-message").filter({ has: anchor });
      const thread = await message.getAttribute("data-thread");
      await expect(message.getByTestId("provenance").first()).toHaveText(`emails.json · ${thread} · email_class`);
    }
  }
  expect(errors).toEqual([]);
});

test("R18: a deep link to the cited evidence lands on it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openInvoice(page, "INV-042");
  // Leave the page so the deep link is a fresh load, not a same-document
  // fragment change: the message rows arrive after the browser's own jump.
  await page.goto("/queue");
  const id = "ev-E-007-1:emails.json:email_class";
  await page.goto(`/invoices/INV-042#${id}`);
  await expect(page.locator(`[id="${id}"]`)).toBeInViewport();
  await page.screenshot({ path: `${REPORTS_DIR}/TASK-34-390-communication-${testInfo.project.name}.png` });
});

test("breadcrumb: detail pages show their trail, not Home", async ({ page }, testInfo) => {
  await openInvoice(page, "INV-042");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs).toHaveText(/^Queue\s*›\s*INV-042$/);
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("INV-042");
  if (testInfo.project.name === "chromium-light")
    await page.screenshot({ path: `${REPORTS_DIR}/TASK-34-breadcrumb-invoice.png` });

  await page.goto("/payments");
  await expect(crumbs).toHaveText("Payments");

  await page.goto("/disputes");
  const href = await page.locator('main a[href^="/disputes/"]').first().getAttribute("href");
  expect(href, "seed has at least one dispute").toBeTruthy();
  await page.goto(href!);
  await expect(crumbs).toHaveText(new RegExp(`^Disputes\\s*›\\s*${href!.split("/").pop()}$`));

  await crumbs.getByRole("link", { name: "Disputes" }).click();
  await expect(page).toHaveURL(/\/disputes$/);
});
