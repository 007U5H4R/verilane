import { test, expect, type Page } from "@playwright/test";

// TASK-26 (TKT-21) · TC-086 S6 trust walk + TC-087 same-origin only.
// Runs on a plain `pnpm build && pnpm start` as well as on `build:e2e`, so it
// drives the real UI only: no `window.__verilane` bridge, no `/e2e-harness`.
// Seed facts: the Queue's top row is a High invoice under the ₹5L Manager
// threshold whose draft passes all nine checks; disputed invoices carry an
// open dispute, so check 6 fails.
const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

// Every other spec blocks service workers (playwright.config.ts); this walk
// runs with the real SW so its requests are covered by TC-087 too.
test.use({ serviceWorkers: "allow" });

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** `invoice_id → row_id` from the CSV the app loads (as in tracer.spec.ts). */
async function csvRowIds(page: Page): Promise<Map<string, string>> {
  const res = await page.request.get("/seed/invoices.csv");
  expect(res.ok()).toBe(true);
  const [header = "", ...lines] = (await res.text()).trim().split(/\r?\n/);
  const cols = header.split(",");
  const rowIdCol = cols.indexOf("row_id");
  const idCol = cols.indexOf("invoice_id");
  return new Map(
    lines.map((line) => {
      const cells = line.split(",");
      return [cells[idCol] ?? "", cells[rowIdCol] ?? ""];
    }),
  );
}

test("TC-086/TC-087: S6 trust walk end to end, same-origin only", async ({ page, context, baseURL }, info) => {
  // TC-087: record every request the context makes — pages and the service
  // worker — before the first navigation.
  const requests: string[] = [];
  let fromServiceWorker = 0;
  context.on("request", (req) => {
    requests.push(req.url());
    if (req.serviceWorker()) fromServiceWorker++;
  });
  const errors = trackConsoleErrors(page);
  const shot = (name: string) =>
    page.screenshot({ path: `${SHOTS}/TASK-26-${name}-${info.project.name}.png`, fullPage: true });

  // 1 · Queue → top High invoice.
  await page.goto("/queue");
  const rows = page.locator('a[href^="/invoices/"]');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator('[data-slot="badge"]').first()).toHaveText(/High/);
  const href = await rows.first().getAttribute("href");
  const invoiceId = decodeURIComponent((href ?? "").replace("/invoices/", ""));
  expect(invoiceId).not.toBe("");
  // The service worker is live for the rest of the walk.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });
  await shot("1-queue");

  await rows.first().click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}$`));

  // 2 · Evidence → provenance: the priority reason cites its sources, and
  // every invoice fact traces to its CSV row and column.
  await expect(page.getByTestId("priority-reason")).toContainText("High");
  const rowNo = (await csvRowIds(page)).get(invoiceId);
  expect(rowNo, `${invoiceId} in invoices.csv`).toBeTruthy();
  await expect(page.getByTestId("priority-reason")).toContainText(`row ${rowNo} · due_date`);
  const facts = page.locator('section[aria-labelledby="ev-invoice-facts"]');
  await expect(facts.locator('tr[data-field="due_date"]').getByTestId("provenance")).toHaveText(
    `invoices.csv · Row ${rowNo} · due_date`,
  );
  await expect(facts.locator('tr[data-field="amount_paise"]').getByTestId("provenance")).toHaveText(
    `invoices.csv · Row ${rowNo} · amount_paise`,
  );
  await shot("2-evidence");

  // 3 · Generate draft → 9/9 checks pass.
  const bar = page.getByTestId("action-bar");
  const primary = bar.getByTestId("primary-action");
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("draft-body")).toBeVisible();
  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
  await expect(page.getByTestId("check-failed")).toHaveCount(0);
  await shot("3-draft");

  // 4 · Analyst submits for approval.
  const role = page.getByRole("group", { name: "Role" });
  await expect(role.getByRole("button", { name: "Analyst" })).toHaveAttribute("aria-pressed", "true");
  await expect(primary).toHaveText("Submit for approval");
  await expect(primary).toHaveAttribute("aria-disabled", "false");
  await primary.click();
  await expect(bar.getByTestId("primary-reason")).toHaveText("Unavailable: Already submitted for approval");
  await expect(page.getByTestId("next-step")).toContainText("Waiting for");

  // 5 · Manager approves → simulated-send toast.
  await role.getByRole("button", { name: "Manager" }).click();
  await expect(role.getByRole("button", { name: "Manager" })).toHaveAttribute("aria-pressed", "true");
  await expect(primary).toHaveText("Approve & send");
  await expect(primary).toHaveAttribute("aria-disabled", "false");
  await primary.click();
  const confirm = page.getByRole("alertdialog", { name: "Approve and send this reminder?" });
  await expect(confirm).toContainText("No real email is sent.");
  await confirm.getByRole("button", { name: "Approve & send" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: `Reminder for ${invoiceId}` }),
  ).toContainText("approved and sent (simulated).");
  await expect(bar.getByTestId("primary-reason")).toHaveText("Unavailable: This reminder has been sent");
  await shot("4-sent");

  // 6 · A disputed invoice is blocked, with the reason. Opened from the
  // Queue's Disputed view, as a user would.
  await page.goto("/queue?band=disputed");
  const disputedRow = page.locator('a[href^="/invoices/"][data-excluded="true"]').first();
  await expect(disputedRow.getByTestId("excluded-badge")).toHaveAttribute("data-band", "disputed");
  const disputed = decodeURIComponent(((await disputedRow.getAttribute("href")) ?? "").replace("/invoices/", ""));
  expect(disputed).not.toBe(invoiceId);
  await disputedRow.click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${disputed}$`));
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("checks-summary")).toHaveText("8 of 9 passed");
  const failed = page.getByTestId("check-failed");
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("No open dispute");
  await expect(primary).toHaveText("Approve & send");
  await expect(primary).toHaveAttribute("aria-disabled", "true");
  await expect(primary).toHaveAccessibleDescription("Unavailable: 1 pre-approval check is failing");
  await expect(page.getByTestId("next-step")).toContainText("No open dispute");
  // A forced click sends nothing.
  await primary.click({ force: true });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await shot("5-disputed-blocked");

  // 7 · /audit shows every step, newest first, with the right actor.
  await page.getByRole("link", { name: "Audit log" }).first().click();
  await expect(page).toHaveURL(/\/audit$/);
  const audit = page.getByTestId("audit-row");
  const expected = [
    { action: "generate_draft", actor: "Manager", subject: disputed },
    { action: "approve_draft", actor: "Manager", subject: invoiceId },
    // The switch is made by the Analyst, as the Analyst.
    { action: "switch_role", actor: "Analyst", subject: "system:workspace" },
    { action: "submit_draft", actor: "Analyst", subject: invoiceId },
    { action: "generate_draft", actor: "Analyst", subject: invoiceId },
  ];
  await expect(audit).toHaveCount(expected.length);
  for (const [i, step] of expected.entries()) {
    const row = audit.nth(i);
    await expect(row).toHaveAttribute("data-action", step.action);
    await expect(row.locator("span.font-semibold")).toHaveText(step.actor);
    await expect(row).toContainText(step.subject);
  }
  await expect(audit.nth(1)).toContainText("(simulated send)");
  await expect(audit.nth(0)).toContainText("8 of 9 checks pass");
  await shot("6-audit");

  // TC-087: nothing left the app's origin — no fonts CDN, analytics or LLM.
  const origin = new URL(baseURL!).origin;
  expect(requests.length).toBeGreaterThan(0);
  // The SW's own fetches (its install-time cache fill) are in the log too.
  expect(fromServiceWorker).toBeGreaterThan(0);
  expect([...new Set(requests.map((u) => new URL(u).origin))]).toEqual([origin]);
  expect(errors).toEqual([]);
});
