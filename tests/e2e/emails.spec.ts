import { test, expect, type Page } from "@playwright/test";

// TASK-38 · Email Conversations (/emails): real counts from the loaded data,
// the four screen states, URL-backed filters, and a read-only conversation
// pane (two-pane at ≥1024 px, a modal sheet below) that shows every message
// verbatim with its stored AI interpretation.

async function openEmails(page: Page, path = "/emails") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

/** Ground truth straight from Dexie, independent of the view's own grouping. */
async function emailFacts(page: Page) {
  return page.evaluate(async () => {
    const db = window.__verilane!.db;
    const emails = await db.emails.toArray();
    const threadIds = [...new Set(emails.map((e) => e.thread_id))];
    const latest = [...emails].sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
    const disputes = await db.disputes.toArray();
    const disputeThreads = new Set(
      disputes.flatMap((d) => {
        const e = emails.find((m) => m.message_id === d.source_message_id);
        return e ? [e.thread_id] : [];
      }),
    );
    return { messages: emails.length, threads: threadIds.length, latest, disputeThreads: disputeThreads.size };
  });
}

test("emails: renders real counts, a paginated list and URL-backed filters", async ({ page }) => {
  await openEmails(page);
  const facts = await emailFacts(page);
  test.skip(facts.threads === 0, "no emails loaded");

  await expect(page.getByRole("heading", { level: 1, name: "Email Conversations" })).toBeVisible();
  await expect(page.getByTestId("emails-subtitle")).toContainText(`${facts.threads} conversation`);
  await expect(page.getByTestId("emails-subtitle")).toContainText(`${facts.messages} message`);

  const kpis = page.getByTestId("emails-kpi");
  await expect(kpis.filter({ hasText: "Conversations" })).toContainText(String(facts.threads));
  await expect(kpis.filter({ hasText: "Raised a dispute" })).toContainText(String(facts.disputeThreads));

  const rows = page.getByTestId("email-thread-row");
  await expect(rows).toHaveCount(Math.min(facts.threads, 10));
  // Latest first by default: the newest message's thread leads the list.
  await expect(rows.first()).toHaveAttribute("data-thread-id", facts.latest!.thread_id);

  if (facts.threads > 10) {
    const pager = page.getByRole("navigation", { name: "Conversation pages" });
    await expect(pager).toContainText(`Showing 1–10 of ${facts.threads}`);
    await pager.getByRole("button", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(pager).toContainText(`Showing 11–`);
  }

  // A KPI card is a filter: the dispute card narrows the list and lands in the URL.
  await kpis.filter({ hasText: "Raised a dispute" }).click();
  await expect(page).toHaveURL(/[?&]linked=dispute/);
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(page.getByTestId("emails-count")).toContainText(`${facts.disputeThreads} of ${facts.threads}`);

  // Search by subject; Clear filters returns to the default URL.
  await page.getByRole("button", { name: /Clear filters/ }).first().click();
  await expect(page).toHaveURL(/\/emails$/);
  await page.getByRole("searchbox", { name: "Search customer, subject or invoice number" }).fill(facts.latest!.subject);
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(rows.first()).toContainText(facts.latest!.subject);
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Search customer, subject or invoice number" })).toHaveValue(facts.latest!.subject);

  // Sort oldest-first is reflected in the URL; latest (the default) is omitted.
  await page.getByLabel("Sort").selectOption("oldest");
  await expect(page).toHaveURL(/[?&]sort=oldest/);
});

test("emails: selecting a conversation opens it in the side pane with each message verbatim", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEmails(page);
  const facts = await emailFacts(page);
  test.skip(facts.threads === 0, "no emails loaded");
  const email = facts.latest!;

  const pane = page.getByTestId("email-pane");
  await expect(pane).toContainText("Select a conversation");

  const row = page.locator(`[data-testid="email-thread-row"][data-thread-id="${email.thread_id}"]`);
  await row.getByRole("link", { name: email.subject, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]thread=${encodeURIComponent(email.thread_id)}`));

  const detail = pane.getByTestId("email-thread-detail");
  await expect(detail).toBeVisible();
  const message = detail.getByTestId("email-message").filter({ hasText: email.message_id });
  await expect(message).toContainText(email.from_address);
  // Body is shown verbatim (whitespace preserved).
  expect(await message.getByTestId("email-body").textContent()).toBe(email.body);
  const interpretation = message.getByTestId("email-interpretation");
  await expect(interpretation).toContainText("AI interpretation");
  await expect(interpretation).toContainText(/Valid|Rejected|Not available\./);

  // Read-only: nothing on the page sends or replies.
  await expect(page.getByRole("button", { name: /send|reply/i })).toHaveCount(0);

  // Linked records point at real routes.
  const links = detail.getByTestId("email-related").getByRole("link");
  for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))) {
    expect(href).toMatch(/^\/(invoices|disputes)\/[^/]+|^\/payments#/);
  }

  await pane.getByRole("button", { name: "Close conversation" }).click();
  await expect(page).not.toHaveURL(/thread=/);
  await expect(pane).toContainText("Select a conversation");

  // An unknown id says so instead of showing a blank pane.
  await openEmails(page, "/emails?thread=NO-SUCH-THREAD");
  await expect(pane).toContainText("No conversation with this id is in the loaded data.");
});

test("emails: below 1024 px the conversation opens as a sheet that closes on Esc", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEmails(page);
  const facts = await emailFacts(page);
  test.skip(facts.threads === 0, "no emails loaded");

  await expect(page.getByTestId("email-pane")).toHaveCount(0);
  const first = page.getByTestId("email-thread-row").first();
  await first.getByRole("link").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("email-thread-detail")).toBeVisible();

  // No horizontal scroll at phone width with the sheet open.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/thread=/);
});

test("emails: renders loading, empty, error and working states", async ({ page }) => {
  await openEmails(page, "/emails?__state=loading");
  const loading = page.locator('[data-state="loading"]').first();
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute("aria-busy", "true");

  await openEmails(page, "/emails?__state=empty");
  const empty = page.locator('[data-state^="empty"]').first();
  await expect(empty).toContainText("No email conversations yet");
  await expect(empty.getByRole("link", { name: "Load or import data" })).toHaveAttribute("href", "/settings#import");

  await openEmails(page, "/emails?__state=error");
  const alert = page.getByRole("alert").filter({ hasText: "Couldn’t load email conversations." });
  await expect(alert).toBeVisible();
  const retry = alert.getByRole("button", { name: "Retry" });
  await Promise.all([page.waitForEvent("load"), retry.click()]);

  await openEmails(page);
  await expect(page.getByTestId("email-thread-list")).toBeVisible();
  await expect(page.getByTestId("email-thread-list")).toHaveAttribute("data-state", "working");
});
