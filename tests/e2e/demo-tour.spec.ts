import { test, expect, type Page } from "@playwright/test";

// TASK-44 · Guided demo tour. The viewer performs every action; the tour only
// points, explains and advances when the real data change lands.

const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    // Pre-existing sidebar prefetch 404s for /emails and /invoices (TASK-42) are ignored.
    const url = msg.location().url;
    if (msg.type() === "error" && !/\/(emails|invoices)\?_rsc=/.test(url)) errors.push(`${msg.text()} ${url}`);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function setRole(page: Page, role: "Manager" | "Analyst"): Promise<void> {
  const button = page.getByRole("group", { name: "Role" }).getByRole("button", { name: role });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

function draftOf(page: Page, invoiceId: string) {
  return page.evaluate(async (id) => {
    const d = await window.__verilane?.db.drafts.where("invoice_id").equals(id).first();
    return { status: d?.status, sent_by: (d as { sent_by?: string } | undefined)?.sent_by };
  }, invoiceId);
}

const callout = (page: Page) => page.getByTestId("tour-callout");

async function expectStep(page: Page, n: number): Promise<void> {
  await expect(callout(page)).toContainText(`Step ${n} of 8`);
}

async function startTour(page: Page): Promise<void> {
  await page.getByTestId("demo-button").click();
  const confirm = page.getByTestId("tour-confirm");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Start demo" }).click();
  await expect(page).toHaveURL(/\/queue$/);
  await expectStep(page, 1);
}

async function goToStep4(page: Page): Promise<void> {
  await startTour(page);
  await callout(page).getByRole("button", { name: "Next" }).click();
  await expectStep(page, 2);
  await callout(page).getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("tour-prompt")).toContainText("INV-A");
  await page.locator('a[href="/invoices/INV-A"]').first().click();
  await expectStep(page, 3);
  await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expectStep(page, 4);
  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
}

test("full tour, viewer does every action", async ({ page }, info) => {
  // Eight steps plus two full-page loads (invoice links hard-navigate, TASK-42): past the 30s default.
  test.setTimeout(90_000);
  const errors = trackConsoleErrors(page);
  await page.goto("/queue");
  await goToStep4(page);
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await expectStep(page, 5);

  await setRole(page, "Manager");
  await expect(page.getByTestId("action-bar").getByTestId("primary-action")).toHaveText(/Approve & send/);
  await page.screenshot({ path: `${SHOTS}/TASK-44-step5-${info.project.name}.png` });
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await page.getByRole("alertdialog", { name: "Approve and send this reminder?" }).getByRole("button", { name: "Approve & send" }).click();
  await expectStep(page, 6);

  await expect(page.getByTestId("tour-prompt")).toContainText("Settings");
  await page.locator("[data-tour=nav-settings]:visible").first().click();
  await expect(page).toHaveURL(/\/settings$/);
  const toggle = page.getByTestId("autopilot-control").getByRole("checkbox", { name: "Let Copilot send low-risk reminders" });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expectStep(page, 7);

  await setRole(page, "Analyst");
  await page.locator("[data-tour=nav-queue]:visible").first().click();
  await page.locator('a[href="/invoices/INV-B"]').first().click();
  await expect(page).toHaveURL(/\/invoices\/INV-B$/);
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await expect.poll(() => draftOf(page, "INV-B"), { timeout: 10_000 }).toEqual({ status: "sent_simulated", sent_by: "copilot" });
  await expectStep(page, 8);

  await page.locator("[data-tour=nav-audit]:visible").first().click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByTestId("audit-row").filter({ hasText: "Draft approved", visible: true }).first()).toBeVisible();
  await expect(page.getByTestId("audit-row").filter({ hasText: "Auto-sent by Copilot", visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/TASK-44-step8-${info.project.name}.png` });
  await callout(page).getByRole("button", { name: "Finish" }).click();
  const finished = page.getByTestId("tour-finished");
  await expect(finished).toBeVisible();
  await expect(finished.getByRole("button", { name: "Restart demo" })).toBeVisible();

  expect(errors).toEqual([]);
});

// Scar: the shell (and its Demo button) paints while the database is still
// opening; a click then must wait for the db, not crash on useDb().
test("Demo clicked while the workspace is loading opens the confirm", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/queue", { waitUntil: "commit" });
  await page.getByTestId("demo-button").click();
  await expect(page.getByTestId("tour-confirm")).toBeVisible();
  expect(errors).toEqual([]);
});

test("step 1 screenshot", async ({ page }, info) => {
  await page.goto("/queue");
  await startTour(page);
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();
  // Scar: the ranked list is taller than the screen; centring it scrolled
  // past the top-ranked rows the pitch is about.
  // …and must not hide them under the sticky top bar either.
  const firstRow = page.locator("[data-tour^=queue-row-]").first();
  await expect(firstRow).toBeInViewport();
  const below = async () => {
    const bar = await page.locator("header").first().boundingBox();
    const row = await firstRow.boundingBox();
    return bar && row ? row.y - (bar.y + bar.height) : -Infinity;
  };
  await expect.poll(below).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/TASK-44-step1-${info.project.name}.png` });
});

test("reload mid-tour resumes the same step without resetting", async ({ page }) => {
  await page.goto("/queue");
  await goToStep4(page);
  await page.reload();
  await expectStep(page, 4);
  expect((await draftOf(page, "INV-A")).status).toBeDefined();
});

test("cold link goes straight into the tour", async ({ page }) => {
  await page.goto("/queue?tour=1&__session=none");
  await expect(page.getByTestId("tour-confirm")).toBeVisible();
  expect(page.url()).not.toContain("/welcome");
  expect(page.url()).not.toContain("tour=1");
});

test("cancel leaves data untouched", async ({ page }) => {
  await page.goto("/invoices/INV-A");
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
  await page.getByTestId("demo-button").click();
  await page.getByTestId("tour-confirm").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("tour-confirm")).toHaveCount(0);
  await expect(callout(page)).toHaveCount(0);
  expect((await draftOf(page, "INV-A")).status).toBeDefined();
});

test("skip and Esc exit", async ({ page }) => {
  await page.goto("/queue");
  await startTour(page);
  await callout(page).getByRole("button", { name: "Skip tour" }).click();
  await expect(callout(page)).toHaveCount(0);
  await startTour(page);
  await page.keyboard.press("Escape");
  await expect(callout(page)).toHaveCount(0);
});

test("Demo while running re-confirms", async ({ page }) => {
  await page.goto("/queue");
  await startTour(page);
  await page.getByTestId("demo-button").click();
  await expect(page.getByTestId("tour-confirm")).toBeVisible();
  await page.getByTestId("tour-confirm").getByRole("button", { name: "Start demo" }).click();
  await expectStep(page, 1);
  await expect(callout(page)).toHaveCount(1);
});

for (const width of [375, 768]) {
  test(`fits ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/queue");
    await startTour(page);
    const fits = async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await callout(page).boundingBox();
      expect(box).not.toBeNull();
      if (width < 768) expect(box!.y + box!.height).toBeGreaterThanOrEqual(800 - 1);
      else expect(box!.y + box!.height).toBeLessThanOrEqual(800);
    };
    await fits();

    // Jump to step 6 with Next (the escape hatch) while staying on /queue: the
    // step needs /settings, so the ring points at the nav entry instead.
    // Steps have one or two stages each, so click Next until step 6 shows (bounded).
    for (let i = 0; i < 12 && !(await callout(page).textContent())?.includes("Step 6 of 8"); i++) {
      await callout(page).getByRole("button", { name: "Next" }).click();
    }
    await expectStep(page, 6);
    await expect(page.getByTestId("tour-prompt")).toContainText("Open Settings");
    await fits();
    await page.screenshot({ path: `${SHOTS}/TASK-44-${width}-step6-${info.project.name}.png` });

    if (width === 375) {
      // The ring slides (200ms) to its target: poll until it settles.
      const offset = async () => {
        const ring = await page.getByTestId("tour-spotlight").boundingBox();
        const more = await page.locator("[data-tour=nav-more]").boundingBox();
        if (!ring || !more) return Infinity;
        return Math.max(Math.abs(ring.x + 6 - more.x), Math.abs(ring.y + 6 - more.y));
      };
      await expect.poll(offset).toBeLessThanOrEqual(2);
    }
  });
}
