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
      // TASK-38: the Payments page groups reconciliation items into one case per email.
      reconciliationCases: new Set(items.filter((r) => r.kind === "reconciliation").map((r) => r.message_id)).size,
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

  // TASK-38: the page is tabbed; Needs Reconciliation (default) shows one case per
  // email, four per page, with a "Showing" count of every case.
  const reconcile = page.getByRole("list", { name: "Needs reconciliation" }).getByTestId("review-item");
  await expect(reconcile).toHaveCount(Math.min(4, counts.reconciliationCases));
  await expect(page.getByRole("navigation", { name: "Reconciliation pages" })).toContainText(
    `of ${counts.reconciliationCases}`,
  );

  // TC-030 on screen: E-007's ₹3,00,000 claim beside the ₹3,40,000 outstanding.
  await openPayments(page, "/payments?q=E-007-1");
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
  await openPayments(page, "/payments?tab=unmatched");
  const unmatched = page.getByRole("list", { name: "Unmatched emails" }).getByTestId("review-item");
  await expect(unmatched).toHaveCount(counts.uncertain);
  for (const item of await unmatched.all()) {
    await expect(item).toContainText(/E-\d{3}-\d/);
  }

  await openPayments(page, "/payments?tab=ledger");
  await expect(page.getByTestId("ledger-row")).toHaveCount(counts.payments);

  await openPayments(page, "/payments?q=E-007-1");

  await page.screenshot({ path: `${REPORTS_DIR}/TASK-13-payments-${testInfo.project.name}.png`, fullPage: true });

  // The email link lands on the invoice's Communication evidence with that message.
  await e007.getByRole("link", { name: "Open email E-007-1" }).click();
  await expect(page).toHaveURL(/\/invoices\/INV-042#ev-communication$/);
  await expect(page.getByTestId("communication-message").and(page.locator('[data-thread="E-007"]'))).toBeVisible();
});

// M-002 R14: "Open email" must reach the email even with no invoice to link
// to (customer_only / unresolved with no candidates, transposition included).
// No seed email happens to land in that state (every sender either is
// unknown with no citable ref, or a known customer with open invoices or a
// resolvable ref) — this test seeds an `unresolved`, zero-candidate item
// directly, the same way the "empty state" test clears tables directly.
test("TC-034 / R14: an unmatched item with no invoice link still opens its email inline", async ({ page }) => {
  await openPayments(page, "/payments?tab=unmatched");
  await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const email = {
      thread_id: "E-900",
      message_id: "E-900-1",
      from_address: "unknown@nowhere.test",
      subject: "Where is my refund?",
      body: "Hi, I think you owe us a refund. Please check.",
      sent_at: "2026-10-01T00:00:00Z",
    };
    await db.emails.put(email);
    await db.matches.put({
      message_id: email.message_id,
      outcome: "unresolved",
      candidates: [],
      reason: "Sender unknown@nowhere.test is not a known customer contact",
    });
    await db.reviewItems.put({
      review_id: "RV-E-900-1-match",
      message_id: email.message_id,
      kind: "uncertain_match",
      status: "open",
      linked_review_ids: [],
      evidence_ids: [],
      recommendation: "Identify the sender before linking this email to any invoice",
      validation_status: "missing",
      escalation_reason: "Sender unknown@nowhere.test is not a known customer contact",
      requires_role: "analyst",
    });
  });

  const item = page
    .getByRole("list", { name: "Unmatched emails" })
    .getByTestId("review-item")
    .and(page.locator('[data-message="E-900-1"]'));
  await expect(item).toHaveCount(1);
  await expect(item.getByRole("link")).toHaveCount(0); // no invoice link exists for this one
  await item.getByText("Open email E-900-1").click();
  const message = item.getByTestId("communication-message");
  await expect(message).toBeVisible();
  await expect(message).toHaveAttribute("data-thread", "E-900");
});

// TASK-38: the three views are a keyboard-operable tablist backed by ?tab=.
test("TASK-38: payments tabs follow arrow keys and the URL", async ({ page }) => {
  await openPayments(page);
  const tabs = page.getByRole("tablist", { name: "Payments views" });
  const reconcile = tabs.getByRole("tab", { name: /Needs Reconciliation/ });
  await expect(reconcile).toHaveAttribute("aria-selected", "true");
  await reconcile.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: /Unmatched Emails/ })).toBeFocused();
  await expect(page).toHaveURL(/[?&]tab=unmatched/);
  await expect(page.getByRole("list", { name: "Unmatched emails" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: /Ledger/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "payments-tab-ledger");
  await page.keyboard.press("Home");
  await expect(reconcile).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/tab=/);
});

async function ledgerSnapshot(page: Page) {
  return page.evaluate(async () => {
    const db = window.__verilane!.db;
    const [payments, invoices] = await Promise.all([db.payments.toArray(), db.invoices.toArray()]);
    return JSON.stringify({ payments, invoices: invoices.map((i) => [i.invoice_id, i.status, i.amount_paise]) });
  });
}

async function investigate(page: Page, caseId: string) {
  await openPayments(page, `/payments?q=${caseId}`);
  const card = page.getByTestId("review-item").and(page.locator(`[data-message="${caseId}"]`));
  await card.getByRole("button", { name: "Investigate" }).click();
  return card.getByTestId("investigation");
}

// TASK-38: an Analyst escalates with a reason; the step is audited and the ledger is untouched.
test("TASK-38: an Analyst escalates a claim to a Manager without touching the ledger", async ({ page }) => {
  await openPayments(page);
  const before = await ledgerSnapshot(page);
  const panel = await investigate(page, "E-007-1");
  await panel.getByRole("button", { name: "Escalate to Manager" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Escalate to a Manager?" });
  await expect(dialog.getByRole("button", { name: "Escalate" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Amount differs from the outstanding; please review.");
  await dialog.getByRole("button", { name: "Escalate" }).click();
  await expect(dialog).toBeHidden();
  const item = await page.evaluate(async () => {
    const items = await window.__verilane!.db.reviewItems.toArray();
    return items.find((r) => r.kind === "reconciliation" && r.message_id === "E-007-1");
  });
  expect(item?.workflow_note).toBe("Amount differs from the outstanding; please review.");
  expect(item?.status).toBe("open");
  expect(await ledgerSnapshot(page)).toBe(before);
});

// TASK-38: verifying a claim is Manager-only — an Analyst sees why it is unavailable.
test("TASK-38: an Analyst cannot verify a claim against the ledger", async ({ page }) => {
  const panel = await investigate(page, "E-009-1");
  const verify = panel.getByRole("button", { name: "Match ledger entry & verify" });
  await expect(verify).toHaveAttribute("aria-disabled", "true");
  await verify.focus(); // aria-disabled stays focusable; activating it opens nothing
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(panel).toContainText("Manager");
});

// TASK-38: a Manager matches E-009's claim to P-011 with evidence; the review records
// the match, while the ledger rows and invoice status/balance stay exactly as they were.
test("TASK-38: a Manager verifies a claim against a ledger entry; the ledger is unchanged", async ({ page }) => {
  await openPayments(page);
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Manager" }).click();
  await expect(page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Manager" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const before = await ledgerSnapshot(page);
  const panel = await investigate(page, "E-009-1");
  await panel.getByRole("button", { name: "Match ledger entry & verify" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Match to a ledger entry and verify?" });
  const confirm = dialog.getByRole("button", { name: "Verify" });
  await dialog.getByRole("radio", { name: /P-011/ }).check();
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Evidence/).fill("Bank statement 2026-10-20 line 14");
  await dialog.getByRole("checkbox", { name: "I checked this entry against the evidence." }).check();
  await confirm.click();
  await expect(dialog).toBeHidden();
  const item = await page.evaluate(async () => {
    const items = await window.__verilane!.db.reviewItems.toArray();
    return items.find((r) => r.kind === "reconciliation" && r.message_id === "E-009-1");
  });
  expect(item?.workflow_state).toBe("verified");
  expect(item?.verified_payment_id).toBe("P-011");
  expect(await ledgerSnapshot(page)).toBe(before);
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
