import { test, expect, type Page } from "@playwright/test";

// TASK-79.9 (TKT-75.09) · TC-75.46: the Discovery §8.2 walk as one
// uninterrupted test against the real UI —
//   Overview → unallocated payment → evidence → recommendation → policy →
//   execute → simulated apply → NSM updates → ambiguous payment approved by
//   a Manager → short-payment pattern flagged →
//   existing dispute shows reminders blocked → every step in the Audit Log.
// Every control the walk touches does something; nothing is clicked for show.
//
// Seed facts (TKT-75.02/04): P-012 (₹25,000) has exactly one candidate,
// INV-F, so its exception RV-PAY-P-012 is auto-permitted and the Execute
// agent allocates it on view. Disputed invoices carry an open dispute, so
// pre-approval check 6 fails and the reminder cannot be submitted.
//
// TKT-75.08 (TASK-79.8, merged at f561490) seeded FS14: P-013 (₹48,000) fits
// INV-019 and INV-020 equally, so RV-PAY-P-013 is low-confidence and
// needs_manager (G3). The walk approves it as the Manager (step 8b).
//
// PENDING step (never faked): the short-payment pattern is TASK-79.5, not on
// base f561490. Flip the flag once it merges; until the step is written,
// flipping it fails the walk loudly instead of passing silently.
const SHORT_PAYMENT_BUILT = false; // TODO(79.5): TC-75.46 short-payment pattern flagged

const LABEL = "Simulated — one demo session = one analyst-week";

/** "₹25,000.00" → 2500000 paise. */
function paise(text: string): number {
  const m = /^₹([\d,]+)\.(\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`not an INR amount: ${JSON.stringify(text)}`);
  return Number(m[1]!.replace(/,/g, "")) * 100 + Number(m[2]);
}

async function nsmPaise(page: Page): Promise<number> {
  const value = vis(page, "home-nsm-value");
  await expect(value).toHaveText(/^₹[\d,]+\.\d{2}$/);
  return paise((await value.textContent()) ?? "");
}

async function setRole(page: Page, role: "Manager" | "Analyst"): Promise<void> {
  const button = page.getByRole("group", { name: "Role" }).getByRole("button", { name: role });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

// Next keeps recently visited routes mounted but hidden during
// client-side navigation, so a bare testid can match a stale, hidden copy of a
// previous page. The walk navigates by clicking, so it only ever asserts on
// what is on screen.
function vis(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

function working(page: Page) {
  return page.locator('[data-state="working"]').filter({ visible: true });
}

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("TC-75.46: §8.2 ExceptionOS walk end to end on the real UI", async ({ page }) => {
  // The sidebar (lg ≥ 1024) carries every nav link the walk clicks.
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = trackConsoleErrors(page);
  const shot = (name: string) =>
    page.screenshot({ path: test.info().outputPath(`walk-${name}.png`), fullPage: true });
  const nav = page.getByRole("complementary", { name: "Primary" });

  // 1 · Overview: Home with the North Star Metric, before anything is resolved.
  await page.goto("/");
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(working(page)).toBeVisible();
  await expect(vis(page, "home-nsm").getByRole("heading", { level: 2, name: "North Star Metric" })).toBeVisible();
  await expect(vis(page, "home-nsm-label")).toContainText(LABEL);
  const before = await nsmPaise(page);
  await expect(vis(page, "feed-exceptions")).toBeVisible();
  await shot("1-overview");

  // 2 · Unallocated payment: Exceptions from the sidebar, then P-012's row.
  await nav.getByRole("link", { name: /^Exceptions/ }).click();
  await expect(page).toHaveURL(/\/exceptions$/);
  const row = vis(page, "exception-row").and(page.locator('[data-id="RV-PAY-P-012"]'));
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Review Unallocated payment RV-PAY-P-012" }).click();
  await expect(page).toHaveURL(/\/exceptions\/RV-PAY-P-012$/);
  await expect(working(page)).toBeVisible();

  // 3 · Evidence: the bank line, the amount and the unapplied cash.
  const evidence = vis(page, "payment-evidence");
  await expect(evidence).toContainText("P-012");
  await expect(evidence).toContainText("₹25,000.00");
  await expect(vis(page, "unapplied-cash")).toBeVisible();

  // 4 · Recommendation: the Recommend agent proposes INV-F with high confidence.
  const recommend = vis(page, "stage-recommend");
  await expect(recommend).toContainText("1. Recommend Agent");
  await expect(recommend).toContainText("INV-F");
  await expect(recommend).toContainText("Confidence: high");
  await expect(recommend).toContainText("Source:");

  // 5 · Policy: a persisted, versioned decision — auto-permitted.
  await expect(vis(page, "stage-policy")).toContainText("Policy verdict: Auto-permitted");
  const card = vis(page, "policy-decision-card");
  await expect(card).toContainText("Auto-permitted");
  await expect(card).toContainText("Decision ID");
  await expect(card).toContainText("Policy version");
  await shot("2-evidence-policy");

  // 6 · Execute + simulated apply: the Execute agent allocated it under policy v1.
  await expect(vis(page, "execute-status")).toHaveText(/Executed by Execute agent · .+ · policy v1/);
  await expect(vis(page, "exception-status")).toHaveText("Resolved");
  await expect(evidence).toContainText("INV-F");
  await expect(vis(page, "exception-submit")).toBeDisabled();
  await expect(vis(page, "exception-submit-reason")).toHaveText("Already resolved");
  await expect(vis(page, "exception-audit")).toContainText("Allocated payment P-012 (₹25,000.00) to INV-F");
  await shot("3-executed");

  // 7 · NSM updates: back on Home, the figure rose by exactly P-012's amount.
  await nav.getByRole("link", { name: /^Home/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(working(page)).toBeVisible();
  await expect.poll(() => nsmPaise(page)).toBe(before + 25_000_00);
  await expect(vis(page, "home-nsm-label")).toContainText(LABEL);
  await shot("4-nsm-updated");

  // 8 · Short-payment pattern flagged — PENDING TASK-79.5.
  if (SHORT_PAYMENT_BUILT) {
    // TODO(79.5): TC-75.46 — open the short-payment exception, assert the
    // pattern flag and its evidence, then remove this throw.
    throw new Error("TODO(79.5) TC-75.46: short-payment step is not written yet — do not flip the flag without it");
  }
  test.info().annotations.push({ type: "pending", description: "TODO(79.5) TC-75.46 short-payment pattern flagged" });

  // 8b · Ambiguous payment → human approval: two equal candidates, so the
  // Policy agent wants a Manager. The Analyst is refused with the reason; the
  // Manager picks a candidate and submits; the NSM counts the human approval.
  await nav.getByRole("link", { name: /^Exceptions/ }).click();
  await expect(page).toHaveURL(/\/exceptions$/);
  const ambiguous = vis(page, "exception-row").and(page.locator('[data-id="RV-PAY-P-013"]'));
  await expect(ambiguous).toBeVisible();
  await ambiguous.getByRole("link", { name: "Review Unallocated payment RV-PAY-P-013" }).click();
  await expect(page).toHaveURL(/\/exceptions\/RV-PAY-P-013$/);
  await expect(working(page)).toBeVisible();
  await expect(vis(page, "payment-evidence")).toContainText("₹48,000.00");
  const recommend13 = vis(page, "stage-recommend");
  await expect(recommend13).toContainText("Confidence: low");
  await expect(recommend13).toContainText("INV-1019");
  await expect(recommend13).toContainText("INV-1020");
  await expect(vis(page, "stage-policy")).toContainText("Policy verdict: Needs manager review");
  await expect(vis(page, "stage-execute")).toHaveAttribute("data-execute-state", "manager");
  await expect(vis(page, "execute-status")).toHaveText("Pending manager hand-off.");
  await expect(vis(page, "exception-audit")).toContainText("Policy Agent evaluated exception (verdict: needs_manager)");
  await expect(vis(page, "candidate-INV-019")).toBeVisible();
  await expect(vis(page, "candidate-INV-020")).toBeVisible();
  await vis(page, "candidate-INV-019").check();
  await expect(vis(page, "exception-submit")).toBeDisabled();
  await expect(vis(page, "exception-submit-reason")).toHaveText("Manager approval required");
  await shot("4b-needs-manager");

  await setRole(page, "Manager");
  await vis(page, "candidate-INV-019").check();
  await expect(vis(page, "exception-submit")).toBeEnabled();
  await vis(page, "exception-submit").click();
  await expect(vis(page, "exception-status")).toHaveText("Resolved");
  await expect(vis(page, "exception-audit")).toContainText("P-013");
  await shot("4c-manager-approved");
  await setRole(page, "Analyst");

  await nav.getByRole("link", { name: /^Home/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => nsmPaise(page)).toBe(before + 25_000_00 + 48_000_00);

  // 9 · An existing dispute shows reminders blocked, with the reason.
  await nav.getByRole("link", { name: /^Queue/ }).click();
  await expect(page).toHaveURL(/\/queue/);
  await page.goto("/queue?band=disputed");
  const disputedRow = page.locator('a[href^="/invoices/"][data-excluded="true"]').first();
  await expect(disputedRow.getByTestId("excluded-badge")).toHaveAttribute("data-band", "disputed");
  const disputed = decodeURIComponent(((await disputedRow.getAttribute("href")) ?? "").replace("/invoices/", ""));
  expect(disputed).not.toBe("");
  await disputedRow.click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${disputed}$`));
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(vis(page, "checks-summary")).toHaveText("8 of 9 passed");
  const failed = vis(page, "check-failed");
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("No open dispute");
  const primary = vis(page, "action-bar").getByTestId("primary-action");
  await expect(primary).toHaveText("Submit for approval");
  await expect(primary).toHaveAttribute("aria-disabled", "true");
  await expect(primary).toHaveAccessibleDescription("Unavailable: 1 pre-approval check is failing");
  await expect(vis(page, "next-step")).toContainText("No open dispute");
  // A forced click submits nothing.
  await primary.click({ force: true });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(vis(page, "checks-summary")).toHaveText("8 of 9 passed");
  await shot("5-dispute-blocked");

  // 10 · Every step is in the Audit Log.
  await nav.getByRole("link", { name: /^Audit Log/ }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await page.getByLabel("Rows per page").selectOption("50");
  const audit = vis(page, "audit-row");
  const byAction = (action: string) => audit.and(page.locator(`[data-action="${action}"]`));
  await expect(byAction("recommend_generated").first()).toBeVisible();
  await expect(byAction("policy_evaluated").first()).toBeVisible();
  const allocated = byAction("allocate_payment");
  await expect(allocated).toHaveCount(2);
  // The Audit Log shows the Execute agent as an automated (System) actor with
  // its own action label (src/domain/audit/classify.ts, TKT-75.04); the
  // Manager is a human actor named by the recorded role.
  const byAgent = allocated.filter({ hasText: "P-012" });
  await expect(byAgent).toHaveCount(1);
  await expect(byAgent.locator("span.font-semibold")).toHaveText("System");
  await expect(byAgent).toContainText("Execute Agent allocated payment");
  const byManager = allocated.filter({ hasText: "P-013" });
  await expect(byManager).toHaveCount(1);
  await expect(byManager.locator("span.font-semibold")).toHaveText("Manager");
  const drafted = byAction("generate_draft");
  await expect(drafted).toHaveCount(1);
  await expect(drafted).toContainText(disputed);
  await expect(drafted).toContainText("8 of 9 checks pass");
  // Nothing was submitted for the disputed invoice.
  await expect(byAction("submit_draft")).toHaveCount(0);
  await shot("6-audit");

  expect(errors).toEqual([]);
});
