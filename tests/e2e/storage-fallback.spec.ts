import { test, expect, type Page } from "@playwright/test";

// TC-018 (SR9): with IndexedDB refused, the app falls back to in-memory
// storage, shows the storage banner, logs a `[verilane]` console.error,
// and the Queue still lists rows (no blank screen).

const BANNER_TEXT = "Changes won't survive reload — storage unavailable";

async function expectFallbackWorks(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/queue");

  await expect(page.getByRole("status").filter({ hasText: BANNER_TEXT })).toBeVisible();
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  expect(await page.locator('a[href^="/invoices/"]').count()).toBeGreaterThan(0);
  expect(errors.some((e) => e.startsWith("[verilane] storage unavailable"))).toBe(true);
}

test("indexedDB.open throwing SecurityError falls back with banner (TC-018)", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
  });
  await expectFallbackWorks(page);
});

test("window.indexedDB throwing SecurityError falls back with banner (TC-018)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  await expectFallbackWorks(page);
});

test("no storage banner when IndexedDB works", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
});
