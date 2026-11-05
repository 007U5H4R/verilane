import { test, expect, type Page } from "@playwright/test";

// TKT-75.02 · TC-75.13: an unallocated bank line flows end to end through
// the existing machinery — seed → /exceptions → open → allocate → gone from
// the open list → audit visible — plus the four screen states, offline, and
// no horizontal scroll at 375 and 768 on both routes.

const ID = "RV-PAY-P-012";

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

test("TC-75.13: allocate P-012 to INV-F from /exceptions; it leaves the open list and the audit shows it", async ({
  page,
}) => {
  await open(page, "/exceptions");
  const row = page.getByTestId("exception-row").and(page.locator(`[data-id="${ID}"]`));
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Unallocated payment");
  await expect(row).toContainText("₹25,000.00");
  await expect(page.getByTestId("exception-count").first()).toBeVisible();

  await row.getByRole("link", { name: `Review Unallocated payment ${ID}` }).click();
  await expect(page).toHaveURL(new RegExp(`/exceptions/${ID}$`));
  await expect(page.getByTestId("payment-evidence")).toContainText("P-012");
  await expect(page.getByTestId("unapplied-cash")).toContainText("₹25,000.00");
  await expect(page.getByTestId("exception-audit")).toContainText("No actions yet.");

  await page.getByTestId("candidate-INV-F").check();
  await page.getByTestId("exception-submit").click();
  await expect(page.getByText("Allocated payment P-012 (₹25,000.00) to INV-F").first()).toBeVisible();
  await expect(page.getByTestId("exception-status")).toHaveText("Resolved");
  await expect(page.getByTestId("exception-audit")).toContainText("Allocated payment P-012 (₹25,000.00) to INV-F");
  await expect(page.getByTestId("exception-submit")).toBeDisabled();

  // Persisted, not just on screen: one ledger row now applies P-012 to INV-F.
  const stored = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    return {
      payment: await db.payments.get("P-012"),
      exception: await db.exceptions.get("RV-PAY-P-012"),
    };
  });
  expect(stored.payment?.invoice_id).toBe("INV-F");
  expect(stored.exception?.status).toBe("actioned");

  await page.getByRole("link", { name: "← Back to exceptions" }).click();
  await expect(page).toHaveURL(/\/exceptions$/);
  await expect(page.locator(`[data-testid="exception-row"][data-id="${ID}"]`)).toHaveCount(0);
});

test("TC-75.13: /exceptions renders loading, empty, error and working, and stays usable offline", async ({
  page,
  context,
}) => {
  await open(page, "/exceptions?__state=loading");
  await expect(page.locator('[data-state="loading"]').first()).toBeVisible();

  await open(page, "/exceptions?__state=empty");
  await expect(page.locator('[data-state="empty"]')).toContainText("No exceptions to review");

  await open(page, "/exceptions?__state=error");
  const alert = page.getByRole("alert").filter({ hasText: "Error loading exceptions. Retry?" });
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();

  await open(page, "/exceptions");
  await expect(page.locator('[data-state="working"]')).toBeVisible();

  // Filters are the Queue's: a search with no hit is a distinct empty state.
  await open(page, "/exceptions?q=zzz-no-such-thing");
  await expect(page.locator('[data-state="empty-filtered"]')).toContainText("No exceptions match these filters");

  await open(page, "/exceptions");
  await context.setOffline(true);
  try {
    await expect(page.getByText("You're offline — viewing cached data; some actions are paused")).toBeVisible();
    await expect(page.locator(`[data-testid="exception-row"][data-id="${ID}"]`)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("TC-75.13: /exceptions/[id] renders loading, not-found, error and working", async ({ page }) => {
  await open(page, `/exceptions/${ID}?__state=loading`);
  await expect(page.locator('[data-state="loading"]').first()).toBeVisible();

  await open(page, `/exceptions/${ID}?__state=error`);
  const alert = page.getByRole("alert").filter({ hasText: "Error loading exception. Retry?" });
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();

  await open(page, "/exceptions/RV-DOES-NOT-EXIST");
  await expect(page.locator('[data-state="not-found"]')).toContainText("Exception not found.");

  await open(page, `/exceptions/${ID}`);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
});

for (const href of ["/exceptions", `/exceptions/${ID}`]) {
  test(`TC-75.13: ${href} does not scroll horizontally at 375 or 768`, async ({ page }) => {
    const overflow: string[] = [];
    for (const vp of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(vp);
      await open(page, href);
      await expect(page.locator('[data-state="working"]')).toBeVisible();
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (scrollWidth > innerWidth) overflow.push(`${href} @${vp.width}: ${scrollWidth} > ${innerWidth}`);
    }
    expect(overflow).toEqual([]);
  });
}
