import { test, expect, type Page } from "@playwright/test";

// TASK-25.1 · TC-079: every data-backed route renders all four screen states
// (Design.md §18) — loading, empty, error, working. Loading/empty/error are
// forced with the E2E-only `?__state=` override (absent from a plain build);
// the working state is the real seeded data, and one real empty state is
// reached through Settings → Reset. Every error offers Retry, and nothing is
// ever blank.

const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

interface RouteStates {
  href: string;
  /** Visible text of the empty state; `null` where a route has no empty state. */
  empty: RegExp | null;
  error: RegExp;
  /** Locator that proves real data rendered. */
  working: (page: Page) => ReturnType<Page["locator"]>;
  /** Puts real data in place first, where the seed alone leaves the route empty. */
  prepare?: (page: Page) => Promise<void>;
}

/** The seed has no drafts: generate + submit a clean one for INV-A. */
async function submitCleanDraft(page: Page): Promise<void> {
  await page.goto("/invoices/INV-A");
  await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByTestId("checks-summary")).toHaveText("9 of 9 passed");
  await page.getByTestId("action-bar").getByTestId("primary-action").click();
  await expect(page.getByTestId("next-step")).toContainText("Waiting for");
}

const ROUTES: RouteStates[] = [
  {
    href: "/",
    empty: /Nothing needs your attention/,
    error: /Couldn’t load the home page\./,
    working: (p) => p.locator('[data-state="working"]'),
  },
  {
    href: "/queue",
    empty: /No invoices yet/,
    error: /Couldn’t load the queue\./,
    working: (p) => p.locator('[data-state="working"]'),
  },
  {
    href: "/disputes",
    empty: /No disputes yet/,
    error: /Couldn’t load disputes\./,
    working: (p) => p.getByTestId("dispute-list"),
  },
  {
    href: "/payments",
    empty: /No payments yet/,
    error: /Couldn’t load payments\./,
    working: (p) => p.locator('[data-state="working"]'),
  },
  {
    href: "/drafts",
    empty: /Nothing waiting for approval/,
    error: /Couldn’t load drafts\./,
    working: (p) => p.getByTestId("draft-list"),
    prepare: submitCleanDraft,
  },
  {
    href: "/audit",
    empty: /No activity recorded yet/,
    error: /Couldn’t load the audit log\./,
    working: (p) => p.locator('[data-state="working"]'),
    // The seed writes no audit events; submitting a draft records some.
    prepare: submitCleanDraft,
  },
  {
    // /disputes/[id] at a fixed seed dispute (D-E-011..020 exist in every seed).
    href: "/disputes/D-E-011-1",
    // A single dispute has no "empty" — its absent case is "Dispute not found" (disputes.spec).
    empty: null,
    error: /Couldn’t load this dispute\./,
    working: (p) => p.getByTestId("dispute-claim-text"),
  },
  {
    href: "/invoices/INV-042",
    // A single invoice has no "empty" — its absent case is "Invoice not found" (checked below).
    empty: null,
    error: /Couldn’t load INV-042\./,
    working: (p) => p.getByTestId("priority-reason"),
  },
];

async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

/** Nothing blank: the main region has a heading or visible text. */
async function expectNotBlank(page: Page): Promise<void> {
  const text = (await page.locator("main").innerText()).trim();
  expect(text.length).toBeGreaterThan(0);
}

for (const r of ROUTES) {
  test(`TC-079: ${r.href} renders loading, empty, error and working`, async ({ page }, testInfo) => {
    const slug = r.href === "/" ? "home" : r.href.slice(1).replace(/\//g, "-");
    const shot = (state: string) =>
      testInfo.project.name === "chromium-light"
        ? page.screenshot({ path: `${REPORTS_DIR}/TASK-25-states-${slug}-${state}.png`, fullPage: true })
        : Promise.resolve(Buffer.alloc(0));

    await page.goto(`${r.href}?__state=loading`);
    await waitForShell(page);
    const loading = page.locator('[data-state="loading"]').first();
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await shot("loading");

    if (r.empty) {
      await page.goto(`${r.href}?__state=empty`);
      await waitForShell(page);
      const empty = page.locator('[data-state^="empty"]').first();
      await expect(empty).toBeVisible();
      await expect(empty).toContainText(r.empty);
      await expectNotBlank(page);
      await shot("empty");
    }

    await page.goto(`${r.href}?__state=error`);
    await waitForShell(page);
    const alert = page.getByRole("alert").filter({ hasText: r.error });
    await expect(alert).toBeVisible();
    const retry = alert.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    await shot("error");
    // Retry does something: it reloads the page.
    await Promise.all([page.waitForEvent("load"), retry.click()]);

    await r.prepare?.(page);
    await page.goto(r.href);
    await waitForShell(page);
    await expect(r.working(page)).toBeVisible();
    await expectNotBlank(page);
    await shot("working");
  });
}

test("TC-079: an unknown invoice shows 'Invoice not found' with a way back, never a blank page", async ({ page }) => {
  await page.goto("/invoices/INV-DOES-NOT-EXIST");
  await waitForShell(page);
  await expect(page.getByRole("heading", { name: "Invoice not found" })).toBeVisible();
  // Invoice details sit under Invoices since TASK-38 (a2a3c4f), so the way back is to /invoices.
  const back = page.locator("main").getByRole("link", { name: /Back to invoices/ });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", "/invoices");
});

test("TC-079: after Settings → Reset, /drafts shows its real empty state", async ({ page }, testInfo) => {
  await page.goto("/settings");
  await waitForShell(page);
  await page.getByRole("button", { name: "Reset demo data" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("Demo data reset.")).toBeVisible();

  await page.goto("/drafts");
  await waitForShell(page);
  const empty = page.locator('[data-state="empty"]');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("Nothing waiting for approval");
  await expect(page.getByTestId("draft-row")).toHaveCount(0);
  if (testInfo.project.name === "chromium-light") {
    await page.screenshot({ path: `${REPORTS_DIR}/TASK-25-states-drafts-real-empty.png`, fullPage: true });
  }
});
