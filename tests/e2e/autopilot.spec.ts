import { test, expect, type Page } from "@playwright/test";

// TASK-41 · Copilot autopilot (simulated auto-send). The demo flow: a draft is
// waiting, a Manager switches autopilot on, Copilot sends it by itself and the
// Audit Log names Copilot. Over the cap, Copilot holds it for a person.
// Seed facts: INV-A passes all nine checks.

const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    // The sidebar prefetches /emails and /invoices, which have no index page on this
    // base (pre-existing, not TASK-41). Only those 404s are ignored.
    const url = msg.location().url;
    if (msg.type() === "error" && !/\/(emails|invoices)\?_rsc=/.test(url)) errors.push(`${msg.text()} ${url}`);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function submitCleanDraft(page: Page): Promise<void> {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await page.goto("/invoices/INV-A");
  await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await expect(page.getByTestId("next-step")).toContainText("Waiting for");
}

async function setRole(page: Page, role: "Manager" | "Analyst"): Promise<void> {
  const button = page.getByRole("group", { name: "Role" }).getByRole("button", { name: role });
  await button.click();
  // The role is persisted asynchronously; navigating before it lands keeps the old one.
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

function draft(page: Page) {
  return page.evaluate(async () => {
    const d = await window.__verilane?.db.drafts.where("invoice_id").equals("INV-A").first();
    return { status: d?.status, sent_by: (d as { sent_by?: string } | undefined)?.sent_by };
  });
}

test("an Analyst can't switch autopilot on", async ({ page }) => {
  await page.goto("/settings");
  const card = page.getByTestId("autopilot-control");
  await expect(card).toContainText("Only a Manager can change Copilot autopilot.");
  await expect(card.getByRole("checkbox")).toBeDisabled();
});

test("a Manager switches autopilot on and Copilot sends the waiting draft (simulated)", async ({ page }, info) => {
  const errors = trackConsoleErrors(page);
  await submitCleanDraft(page);

  await page.goto("/drafts");
  await expect(page.getByTestId("draft-list").locator(":scope > li")).toHaveCount(1);
  await expect(page.getByTestId("autopilot-badge")).toHaveCount(0); // off: no promise made

  await setRole(page, "Manager");
  await page.goto("/settings");
  const card = page.getByTestId("autopilot-control");
  // INV-A is ₹3.4L, over the ₹50,000 default cap: raise it (still inside the ₹5L Analyst limit).
  await card.getByLabel(/Largest reminder Copilot may send/).fill("400000");
  await card.getByRole("button", { name: "Save cap" }).click();
  await expect(page.getByText("Copilot autopilot off.")).toBeVisible();
  // Controlled by the stored policy: it flips once the save lands, so click then wait.
  const toggle = card.getByRole("checkbox", { name: "Let Copilot send low-risk reminders" });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByText(/Copilot sent the reminder to .* \(simulated\)/)).toBeVisible();
  await expect.poll(() => draft(page)).toEqual({ status: "sent_simulated", sent_by: "copilot" });
  await page.screenshot({ path: `${SHOTS}/TASK-41-settings-on-${info.project.name}.png`, fullPage: true });

  await page.goto("/audit");
  const row = page.getByTestId("audit-row").filter({ hasText: "Auto-sent by Copilot", visible: true }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Copilot");
  await page.screenshot({ path: `${SHOTS}/TASK-41-audit-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("over the cap, Copilot holds the draft and says why", async ({ page }) => {
  await submitCleanDraft(page);
  await setRole(page, "Manager");
  await page.goto("/settings");
  const card = page.getByTestId("autopilot-control");
  await card.getByLabel(/Largest reminder Copilot may send/).fill("1");
  await card.getByRole("button", { name: "Save cap" }).click();
  await expect(page.getByText("Copilot autopilot off.")).toBeVisible();
  await card.getByRole("checkbox").click();
  await expect(card.getByRole("checkbox")).toBeChecked();

  await page.goto("/drafts");
  await expect(page.getByTestId("autopilot-badge")).toContainText("Needs you: Over the ₹1.00 autopilot cap.");
  expect((await draft(page)).status).toBe("validated");
});

for (const width of [375, 768]) {
  test(`autopilot card fits a ${width}px screen`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/settings");
    await expect(page.getByTestId("autopilot-control")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/TASK-41-settings-${width}-${info.project.name}.png`, fullPage: true });
  });
}
