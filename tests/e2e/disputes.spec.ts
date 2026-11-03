import { test, expect, type Page } from "@playwright/test";

// TASK-17 · TC-052/TC-053: a muted Queue row links to its Dispute, the
// Disputes list/detail show claim text + email provenance + AI
// recommendation + status/type for every dispute, the sidebar badge counts
// open disputes, and all four screen states render on both pages.

const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

async function openDisputes(page: Page, path = "/disputes") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
}

async function disputeFacts(page: Page) {
  return page.evaluate(async () => {
    const db = window.__verilane!.db;
    const disputes = await db.disputes.toArray();
    const withEmail = await Promise.all(
      disputes.map(async (d) => ({
        dispute: d,
        email: d.source_message_id ? await db.emails.get(d.source_message_id) : undefined,
      })),
    );
    return {
      total: disputes.length,
      open: disputes.filter((d) => d.status !== "resolved" && d.status !== "rejected").length,
      withEmail: withEmail.filter((x) => x.email !== undefined),
      first: disputes[0],
    };
  });
}

test("TC-053: disputes list shows every dispute with its provenance, and the sidebar badge counts the open ones", async ({
  page,
}, testInfo) => {
  await openDisputes(page);
  const facts = await disputeFacts(page);
  test.skip(facts.total === 0, "seed carries no disputed/duplicate emails to assert against");

  // TASK-38: the list pages six disputes at a time.
  await expect(page.getByTestId("dispute-row")).toHaveCount(Math.min(facts.total, 6));
  await expect(page.getByTestId("dispute-count")).toHaveText(String(facts.open));

  if (facts.withEmail.length > 0) {
    const { dispute, email } = facts.withEmail[0]!;
    // TASK-38: the row may be on a later page, so search for it first.
    await page.getByPlaceholder("Search by customer, invoice no., or keyword...").fill(dispute.dispute_id);
    const row = page.getByTestId("dispute-row").filter({ hasText: dispute.claim_text });
    await expect(row.getByTestId("dispute-provenance")).toHaveText(`${email!.from_address} · ${email!.subject}`);
  }

  await page.screenshot({ path: `${REPORTS_DIR}/TASK-17-disputes-list-${testInfo.project.name}.png`, fullPage: true });
});

test("TC-053: dispute detail shows claim, type, status, recommendation and (when present) provenance", async ({
  page,
}, testInfo) => {
  await openDisputes(page);
  const facts = await disputeFacts(page);
  test.skip(facts.total === 0, "seed carries no disputed/duplicate emails to assert against");

  const d = facts.first!;
  await page.goto(`/disputes/${d.dispute_id}`);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(page.getByTestId("dispute-claim-text")).toHaveText(d.claim_text);
  await expect(page.getByTestId("dispute-recommendation")).toHaveText(d.ai_recommendation);
  await expect(page.getByTestId("dispute-status")).toBeVisible();

  if (d.source_message_id) {
    const email = await page.evaluate(
      (id) => window.__verilane!.db.emails.get(id),
      d.source_message_id,
    );
    await expect(page.getByTestId("dispute-provenance")).toContainText(email!.from_address);
    await expect(page.getByTestId("dispute-provenance")).toContainText(email!.subject);
  }

  await page.screenshot({ path: `${REPORTS_DIR}/TASK-17-dispute-detail-${testInfo.project.name}.png`, fullPage: true });
});

test("TC-053: /disputes loading, empty and error states", async ({ page }, testInfo) => {
  const shot = (name: string) =>
    page.screenshot({ path: `${REPORTS_DIR}/TASK-17-disputes-${name}-${testInfo.project.name}.png`, fullPage: true });

  await page.goto("/disputes?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");
  await shot("loading");

  await page.goto("/disputes?__state=empty");
  await expect(page.getByRole("heading", { name: "No disputes yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Load or import data" })).toHaveAttribute("href", "/settings#import");
  await shot("empty");

  await page.goto("/disputes?__state=error");
  const alert = page.getByRole("alert").filter({ hasText: "Couldn’t load disputes." });
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  await shot("error");
});

test("TC-053: /disputes/[id] loading, error and not-found states", async ({ page }, testInfo) => {
  const shot = (name: string) =>
    page.screenshot({ path: `${REPORTS_DIR}/TASK-17-dispute-detail-${name}-${testInfo.project.name}.png`, fullPage: true });

  await page.goto("/disputes/D-anything?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");
  await shot("loading");

  await page.goto("/disputes/D-anything?__state=error");
  const alert = page.getByRole("alert").filter({ hasText: "Couldn’t load this dispute." });
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  await shot("error");

  await openDisputes(page, "/disputes/D-does-not-exist");
  await expect(page.locator('[data-state="not-found"]')).toBeVisible();
  await expect(page.getByText("Dispute not found.")).toBeVisible();
});

test("TC-052: mark_disputed excludes the invoice from the queue, muted with a working dispute link", async ({
  page,
}) => {
  await page.goto("/queue");
  await page.waitForFunction(() => window.__verilane !== undefined);

  const invoiceId = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const priorities = await db.priorities.toArray();
    // Gates run in order (G1 closed, G2/G3 needs_review, G4 disputed, …), so
    // an invoice already gated earlier than G4 would stay there even once
    // disputed — pick a score-based band (high/medium/low/not_due), which
    // only exists because G1-G3 already passed, so G4 will catch it.
    const open = priorities.find((p) => ["high", "medium", "low", "not_due"].includes(p.band));
    return open!.invoice_id;
  });

  const disputeId = await page.evaluate(async (id) => {
    await window.__verilane!.execute({
      type: "mark_disputed",
      subject: { kind: "invoice", id },
      payload: { type: "incorrect_amount", claim_text: "Customer says the amount is wrong." },
    });
    // mark_disputed doesn't itself recompute priorities (only import_csv /
    // reset_demo / set_as_of do, per tx.ts's WHOLE_DB set) — nudge the
    // as-of date and back to force the recompute the Queue reads from.
    await window.__verilane!.execute({
      type: "set_as_of",
      subject: { kind: "system", id: "as-of" },
      payload: { as_of: "2027-01-01" },
    });
    await window.__verilane!.execute({
      type: "set_as_of",
      subject: { kind: "system", id: "as-of" },
      payload: { as_of: null },
    });
    const db = window.__verilane!.db;
    const d = (await db.disputes.toArray()).find((x) => x.invoice_id === id);
    return d!.dispute_id;
  }, invoiceId);

  await page.goto("/queue?band=disputed");
  const row = page.locator(`a[href="/invoices/${invoiceId}"]`);
  await expect(row).toHaveAttribute("data-excluded", "true");
  await expect(row.getByTestId("excluded-badge")).toHaveAttribute("data-band", "disputed");

  // The dispute-link sits beside the row's own link, not nested inside its
  // <a> — scope to the row's container so other disputed rows don't match.
  const disputeLink = row.locator("..").getByTestId("dispute-link");
  await expect(disputeLink).toHaveAttribute("href", `/disputes/${disputeId}`);
  await disputeLink.click();
  await expect(page).toHaveURL(`/disputes/${disputeId}`);
  // The link is a plain <a> (sibling of the row's own <a>, not a Next
  // `Link`), so this is a full navigation — wait for the bridge to remount.
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(page.getByTestId("dispute-claim-text")).toHaveText("Customer says the amount is wrong.");
  await expect(page.getByTestId("dispute-status")).toHaveText("New");

  // Note (TASK-17 report): approval blocked by check 6 (the Investigation
  // ActionBar opening MarkDisputedDialog) is out of scope here — TASK-15/16
  // own that wiring and are not merged into this branch.
});
