import { test, expect, type BrowserContext, type Page } from "@playwright/test";

import SEED_MANIFEST from "../../public/seed/manifest.json";

// TASK-24 (TKT-19): PWA manifest, service worker, offline, install chip.
// TC numbers follow test-cases.md. Runs against the production build
// (`next start`), where the service worker is registered.
const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";
const OFFLINE_BANNER = "You're offline — viewing cached data; some actions are paused";
const STORAGE_BANNER = "Changes won't survive reload — storage unavailable";

// The suite blocks service workers (playwright.config.ts); these tests need it.
test.use({ serviceWorkers: "allow" });

async function swControlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });
}

async function cacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}

async function storedSeedVersion(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("verilane");
        open.onerror = () => resolve(undefined);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("meta")) {
            db.close();
            resolve(undefined);
            return;
          }
          const get = db.transaction("meta").objectStore("meta").get("seedVersion");
          get.onsuccess = () => {
            db.close();
            resolve((get.result as { value?: unknown } | undefined)?.value);
          };
          get.onerror = () => {
            db.close();
            resolve(undefined);
          };
        };
      }),
  );
}

async function fireInstallPrompt(page: Page) {
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
}

test("TC-075: manifest declares standalone install metadata and the SW registers", async ({ page }) => {
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as {
    display: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#0f3d29");
  expect(manifest.background_color).toBe("#f8f7f3");
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    const img = await page.request.get(icon.src);
    expect(img.ok(), icon.src).toBe(true);
    expect(img.headers()["content-type"]).toContain("image/png");
  }

  await page.goto("/queue");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await swControlled(page);
  const scriptURL = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "");
  expect(scriptURL).toMatch(/\/sw\.js$/);
  expect(await cacheKeys(page)).toEqual([`verilane-${SEED_MANIFEST.seedVersion}`]);
});

test("TC-075c: /sw.js is served uncached with a strict CSP (T24-10)", async ({ page }) => {
  const res = await page.request.get("/sw.js");
  expect(res.ok()).toBe(true);
  const headers = res.headers();
  expect(headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
  expect(headers["content-type"]).toBe("application/javascript; charset=utf-8");
  expect(headers["content-security-policy"]).toBe("default-src 'self'; script-src 'self'");
});

test("TC-076: offline loads from cache with the offline banner; import/reset disabled", async ({ page, context }, info) => {
  // IndexedDB refused → the storage banner would show; offline must win.
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
  });
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await swControlled(page);
  await expect(page.getByRole("status").filter({ hasText: STORAGE_BANNER })).toBeVisible();
  // Visit Settings online once so its page is cached too.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.goto("/queue");
    await expect(page.getByRole("status").filter({ hasText: OFFLINE_BANNER })).toBeVisible();
    await expect(page.getByText(STORAGE_BANNER)).toHaveCount(0);
    await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/TASK-24-TC-076-queue-${info.project.name}.png` });

    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    // In-memory storage still gives a db, so the data sections render.
    const importSection = page.locator("#import");
    await expect(importSection.getByRole("button", { name: "Import" })).toBeDisabled();
    await expect(page.getByTestId("import-offline-reason")).toHaveText(/Unavailable offline/);
    const resetSection = page.locator("#reset");
    await expect(resetSection.getByRole("button", { name: /reset/i })).toBeDisabled();
    await expect(resetSection.getByTestId("reset-offline-reason")).toHaveText(/Unavailable offline/);
    await page.screenshot({ path: `${SHOTS}/TASK-24-TC-076-settings-${info.project.name}.png`, fullPage: true });
  } finally {
    await context.setOffline(false);
  }
  // Back online: the triggers come back.
  await expect(page.getByTestId("import-offline-reason")).toHaveCount(0);
  await expect(page.getByTestId("reset-offline-reason")).toHaveCount(0);
});

/** Serves a bumped seed manifest. Never touches the tracked file (T24-3). */
async function routeBumpedManifest(context: BrowserContext, seedVersion: string) {
  await context.route("**/seed/manifest.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ ...SEED_MANIFEST, seedVersion }),
    }),
  );
}

async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
}

test("TC-077: a seed version bump evicts the old cache and serves the new seed", async ({ page, context }) => {
  const bumpedVersion = `${SEED_MANIFEST.seedVersion}-tc077`;
  await page.goto("/queue");
  await swControlled(page);
  await expect.poll(() => cacheKeys(page)).toEqual([`verilane-${SEED_MANIFEST.seedVersion}`]);
  // First-run seeding must have recorded the old version before the bump.
  await expect.poll(() => storedSeedVersion(page)).toBe(SEED_MANIFEST.seedVersion);

  await routeBumpedManifest(context, bumpedVersion);
  await page.reload();
  await expect(page.getByText("New demo data available")).toBeVisible();
  await expect.poll(() => cacheKeys(page)).toEqual([`verilane-${bumpedVersion}`]);

  // The page's view of the manifest (through the SW) is the new one.
  const served = await page.evaluate(() => fetch("/seed/manifest.json").then((r) => r.json()));
  expect((served as { seedVersion: string }).seedVersion).toBe(bumpedVersion);
  // The new cache holds the seed files, not just the manifest.
  const cachedSeed = await page.evaluate(
    async (name) => (await (await caches.open(name)).match("/seed/invoices.csv")) !== undefined,
    `verilane-${bumpedVersion}`,
  );
  expect(cachedSeed).toBe(true);

  // Reset after the bump re-seeds from the new cache's data.
  const prompt = page.getByRole("status").filter({ hasText: "New demo data available" });
  await prompt.getByRole("button", { name: "Reset" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reset workspace demo data?" });
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("New demo data available")).toHaveCount(0);
  await expect.poll(() => storedSeedVersion(page)).toBe(bumpedVersion);
  expect(await cacheKeys(page)).toEqual([`verilane-${bumpedVersion}`]);

  // T24-1: the bump carried the shell and visited pages over, so an offline
  // reload still works.
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: OFFLINE_BANNER })).toBeVisible();
    await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("TC-077b: a bump whose seed files fail is not adopted and never serves stale seed", async ({ page, context }) => {
  await page.goto("/queue");
  await swControlled(page);
  await expect.poll(() => cacheKeys(page)).toEqual([`verilane-${SEED_MANIFEST.seedVersion}`]);
  await expect.poll(() => storedSeedVersion(page)).toBe(SEED_MANIFEST.seedVersion);

  const swErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("[sw]")) swErrors.push(msg.text());
  });
  await routeBumpedManifest(context, "2026-10-30.1-broken");
  await context.route("**/seed/payments.csv", (route) => route.fulfill({ status: 404, body: "missing" }));

  await page.reload();
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  // T24-6: the failure reaches the page instead of vanishing inside the SW.
  await expect.poll(() => swErrors.length).toBeGreaterThan(0);
  // The half-built cache is dropped; the consistent old one stays.
  await expect.poll(() => cacheKeys(page)).toEqual([`verilane-${SEED_MANIFEST.seedVersion}`]);
  // The 404 surfaces; the SW never answers with the old cached payments.csv.
  const status = await page.evaluate(() => fetch("/seed/payments.csv").then((r) => r.status));
  expect(status).toBe(404);
});

const OFFLINE_PAGE_TITLE = "You're offline — this page wasn't saved for offline use";

test("TC-076b: an unvisited route offline shows the offline page, never Home (T24-5)", async ({ page, context }, info) => {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await swControlled(page);

  await context.setOffline(true);
  try {
    // Hard navigation to a route this browser never opened.
    await page.goto("/audit");
    await expect(page.getByRole("heading", { level: 1, name: OFFLINE_PAGE_TITLE })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/");
    await page.screenshot({ path: `${SHOTS}/TASK-35-offline-page-${info.project.name}.png`, fullPage: true });

    // A query string still matches the cached page it filters.
    await page.goto("/queue?band=high");
    await expect(page.getByRole("status").filter({ hasText: OFFLINE_BANNER })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: OFFLINE_PAGE_TITLE })).toHaveCount(0);
    await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("TC-076c: offline in-app navigation to an unvisited route never shows Home (T24-5)", async ({ page, context }) => {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await swControlled(page);

  const target = "/settings/eval";
  const documentLoads: string[] = [];
  page.on("request", (req) => {
    if (!req.isNavigationRequest() || req.frame() !== page.mainFrame()) return;
    const url = new URL(req.url());
    documentLoads.push(url.pathname + url.search);
  });

  await context.setOffline(true);
  try {
    // A client (soft) navigation to a route nothing on /queue links to, so it
    // was never prefetched (T35-4; nav routes are, and render offline): the
    // router's RSC fetch fails offline, so it falls back to a document load,
    // which the SW must answer with the offline page, never Home's HTML.
    await page.evaluate((url) => {
      (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push(url);
    }, target);
    await expect(page).toHaveURL(/\/settings\/eval$/);
    await expect(page.getByRole("heading", { level: 1, name: OFFLINE_PAGE_TITLE })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toHaveCount(0);
    // The fallback branch ran: the router gave up and loaded the document.
    expect(documentLoads).toContain(target);
  } finally {
    await context.setOffline(false);
  }
});

test("TC-075b: API responses are never cached by the service worker (T24-9)", async ({ page }) => {
  await page.goto("/queue");
  await swControlled(page);
  await page.evaluate(() => fetch("/api/llm/status").then((r) => r.status).catch(() => 0));
  expect((await cachedUrls(page)).filter((u) => u.startsWith("/api/"))).toEqual([]);
});

test("TC-078: the install chip is dismissible, non-modal, and Settings keeps Install app", async ({ page }, info) => {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await expect(page.getByTestId("install-chip")).toHaveCount(0);

  await fireInstallPrompt(page);
  const chip = page.getByTestId("install-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("Install Verilane");
  // Non-modal: no dialog, and the page stays interactive.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/TASK-24-TC-078-chip-${info.project.name}.png` });

  await chip.getByRole("button", { name: "Dismiss install prompt" }).click();
  await expect(page.getByTestId("install-chip")).toHaveCount(0);

  // Dismissed for the session: a later prompt in this tab doesn't bring it back.
  await page.reload();
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();
  await fireInstallPrompt(page);
  await expect(page.getByTestId("install-chip")).toHaveCount(0);

  // T24-2: Chromium fires beforeinstallprompt once per document. The event
  // captured on /queue must reach Settings after in-app navigation, with no
  // re-fire. The window marker proves this was a client navigation.
  await page.evaluate(() => Object.assign(window, { __tc078SameDocument: true }));
  await page.locator('nav[aria-label="Main"] a[href="/settings"]:visible').first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => (window as { __tc078SameDocument?: boolean }).__tc078SameDocument)).toBe(true);
  const install = page.locator("#install").getByRole("button", { name: "Install app" });
  await expect(install).toBeVisible();
  // One prompt per event: using it clears it for every consumer.
  await install.click();
  await expect(page.locator("#install").getByText(/Not installable right now/)).toBeVisible();
});
