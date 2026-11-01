import { test, expect, type Page, type Request } from "@playwright/test";

// TASK-16 · TC-048 / TC-049: approve → confirm → simulated send, the
// Mark-disputed wiring, and the /drafts page with its live sidebar badge.
// (technical-plan.md names TC-048's spec `approve.spec.ts`; it lives here
// with the rest of TASK-16's flows.)
// Seed facts: INV-A passes all nine checks.

const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function openInvoice(page: Page, invoiceId: string): Promise<void> {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
}

/** Generate + submit a clean draft for INV-A, leaving it `validated`. */
async function submitCleanDraft(page: Page): Promise<void> {
  await openInvoice(page, "INV-A");
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await expect(page.getByTestId("next-step")).toContainText("Waiting for");
}

async function asManager(page: Page): Promise<void> {
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Manager" }).click();
}

function draftStatus(page: Page, invoiceId: string) {
  return page.evaluate(
    (id) => window.__verilane?.db.drafts.where("invoice_id").equals(id).first().then((d) => d?.status),
    invoiceId,
  );
}

test("TC-048: Manager approves through a confirm dialog; the send is simulated with no network call", async ({ page }, info) => {
  const errors = trackConsoleErrors(page);
  await submitCleanDraft(page);
  await asManager(page);

  const facts = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const draft = await db.drafts.where("invoice_id").equals("INV-A").first();
    const inv = await db.invoices.filter((i) => i.invoice_id === "INV-A").first();
    const cust = inv ? await db.customers.get(inv.customer_id) : undefined;
    const rupees = Number(draft!.amount_paise) / 100;
    // Mirrors formatInr (src/domain/money.ts).
    const amount = `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rupees)}`;
    return { amount, customer: cust?.name ?? inv!.customer_id };
  });
  const amountText = facts.amount;

  const primary = page.getByTestId("action-bar").getByTestId("primary-action");
  await expect(primary).toHaveText("Approve & send");
  await expect(primary).toHaveAttribute("aria-disabled", "false");
  await primary.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Approve and send this reminder?");
  await expect(dialog).toContainText("INV-A");
  await expect(dialog).toContainText(facts.customer);
  await expect(dialog).toContainText(amountText);
  await page.screenshot({ path: `${SHOTS}/TASK-16-tc048-confirm-${info.project.name}.png`, fullPage: true });

  // Capture every request from confirm until the toast: none may leave the
  // app's origin and none may hit an API route (the send is simulated).
  const requests: Request[] = [];
  const onRequest = (r: Request) => requests.push(r);
  page.on("request", onRequest);
  await dialog.getByRole("button", { name: "Approve & send" }).click();
  const toastText = `Reminder for INV-A (${facts.customer}) approved and sent (simulated).`;
  await expect(page.getByText(toastText, { exact: true })).toBeVisible();
  page.off("request", onRequest);

  // Only the page's own document and static assets may load: no fetch/XHR (server
  // actions, route handlers, RSC), no non-GET, nothing off-origin.
  const origin = new URL(page.url()).origin;
  const STATIC = new Set(["document", "stylesheet", "image", "font", "script", "media"]);
  const offending = requests
    .filter((r) => !r.url().startsWith("data:"))
    .filter(
      (r) =>
        new URL(r.url()).origin !== origin ||
        r.method() !== "GET" ||
        !STATIC.has(r.resourceType()) ||
        r.headers()["next-action"] !== undefined,
    )
    .map((r) => `${r.method()} ${r.resourceType()} ${r.url()}`);
  expect(offending).toEqual([]);

  expect(await draftStatus(page, "INV-A")).toBe("sent_simulated");
  await expect(page.getByTestId("action-bar").getByTestId("primary-reason")).toHaveText(/\S/);
  await page.screenshot({ path: `${SHOTS}/TASK-16-tc048-sent-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("TC-048: an Analyst cannot approve and Cancel leaves the draft validated", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await submitCleanDraft(page);

  // Analyst: no Approve & send primary at all.
  await expect(page.getByTestId("action-bar").getByRole("button", { name: "Approve & send" })).toHaveCount(0);

  await asManager(page);
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await draftStatus(page, "INV-A")).toBe("validated");
  expect(errors).toEqual([]);
});

test("TASK-16: Mark disputed opens a dispute and blocks Approve with an inline reason", async ({ page }, info) => {
  const errors = trackConsoleErrors(page);
  await submitCleanDraft(page);

  const bar = page.getByTestId("action-bar");
  await bar.getByRole("button", { name: "Mark disputed" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Mark as disputed?");
  await dialog.getByPlaceholder("What is the customer disputing?").fill("Customer says goods arrived damaged.");
  await dialog.getByRole("button", { name: "Mark as disputed" }).click();
  await expect(page.getByText("Marked as disputed.", { exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await asManager(page);
  // The open dispute blocks Approve inline, live — the stored checks predate it.
  const primary = bar.getByTestId("primary-action");
  await expect(primary).toHaveText("Approve & send");
  await expect(primary).toHaveAttribute("aria-disabled", "true");
  await expect(bar.getByTestId("primary-reason")).toHaveText("Unavailable: This invoice has an open dispute");
  await primary.click({ force: true });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await draftStatus(page, "INV-A")).not.toBe("sent_simulated");

  await page.screenshot({ path: `${SHOTS}/TASK-16-disputed-blocked-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("TC-049: /drafts lists drafts awaiting approval and the sidebar badge is live", async ({ page }, info) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  const badge = page.getByTestId("draft-count");
  const before = Number(await badge.textContent());

  await submitCleanDraft(page);
  await expect(badge).toHaveText(String(before + 1));

  await page.goto("/drafts");
  const list = page.getByTestId("draft-list");
  await expect(list).toHaveAttribute("data-state", "working");
  const row = list.getByTestId("draft-row").filter({ has: page.locator('a[href="/invoices/INV-A"]') });
  await expect(row).toHaveCount(1);
  await expect(page.getByTestId("draft-row")).toHaveCount(before + 1);
  await page.screenshot({ path: `${SHOTS}/TASK-16-tc049-working-${info.project.name}.png`, fullPage: true });

  await row.getByRole("link").click();
  await expect(page).toHaveURL(/\/invoices\/INV-A$/);
  await asManager(page);
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Approve & send" }).click();
  await expect(page.getByText(/approved and sent \(simulated\)\.$/)).toBeVisible();
  await expect(badge).toHaveText(String(before));
  expect(errors).toEqual([]);
});

test("TC-049: /drafts renders loading, empty and error states", async ({ page }, info) => {
  await page.goto("/drafts?__state=loading");
  await expect(page.getByRole("status", { name: "Loading drafts" }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/TASK-16-tc049-loading-${info.project.name}.png`, fullPage: true });

  await page.goto("/drafts?__state=empty");
  await expect(page.getByText("Nothing waiting for approval")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to queue" })).toHaveAttribute("href", "/queue");
  await page.screenshot({ path: `${SHOTS}/TASK-16-tc049-empty-${info.project.name}.png`, fullPage: true });

  await page.goto("/drafts?__state=error");
  await expect(page.getByText("Couldn’t load drafts.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Retry/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/TASK-16-tc049-error-${info.project.name}.png`, fullPage: true });
});

// T16-4 (TASK-33): a validated draft whose last validation left failed checks
// (approve_draft's live re-check writes exactly this) is not awaiting approval:
// it leaves the badge and the awaiting list, and shows as "Blocked — checks failed".
test("T16-4: a draft with failed checks is blocked, not awaiting approval", async ({ page }, info) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  const badge = page.getByTestId("draft-count");
  const before = Number(await badge.textContent());

  await submitCleanDraft(page);
  await expect(badge).toHaveText(String(before + 1));

  // Same row shape approve_draft leaves after a failed re-check (status stays validated).
  await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const draft = await db.drafts.where("invoice_id").equals("INV-A").first();
    await db.drafts.put({ ...draft!, failed_checks: [3] });
  });
  await expect(badge).toHaveText(String(before));

  await page.goto("/drafts");
  const blocked = page.getByTestId("blocked-drafts");
  await expect(blocked.getByRole("heading", { name: "Blocked — checks failed" })).toBeVisible();
  const row = blocked.getByTestId("blocked-draft-row").filter({ has: page.locator('a[href="/invoices/INV-A"]') });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("list", { name: "Failed checks" })).toHaveText("Amount matches outstanding");
  await expect(page.getByTestId("draft-row").filter({ has: page.locator('a[href="/invoices/INV-A"]') })).toHaveCount(0);
  await expect(page.getByTestId("draft-row")).toHaveCount(before);
  expect(await draftStatus(page, "INV-A")).toBe("validated");
  await page.screenshot({ path: `${SHOTS}/TASK-33-t16-4-blocked-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
