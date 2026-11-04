import { test, expect, type Response } from "@playwright/test";

// TASK-46.8 · TC-124 (R5b): the heritage art survives a cold offline reload.
// One online visit to `/`, wait for the service worker to control the page,
// go offline, reload, then probe the band's computed URL with `new Image()`.
// Under path B (EXE55) a failure here is reported to the user (PRD §5.4), not
// patched: sw.js is shared infrastructure.

// The suite blocks service workers (playwright.config.ts); this test needs it.
test.use({ serviceWorkers: "allow" });

test("TC-124: the heritage art survives a cold offline reload (SW, R5b)", async ({ page, context }, info) => {
  test.skip(info.project.name !== "chromium-light", "theme-independent; one project is enough");
  const served: { url: string; fromServiceWorker: boolean; status: number; offline: boolean }[] = [];
  let offline = false;
  page.on("response", (r: Response) => {
    if (r.url().includes("/heritage/")) served.push({ url: r.url(), fromServiceWorker: r.fromServiceWorker(), status: r.status(), offline });
  });

  await page.goto("/");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });

  // The URL the band actually uses, resolved by the browser from image-set().
  const url = await page.locator("[data-heritage]").evaluate((el) => {
    const m = /url\("?([^")]+)"?\)/.exec(getComputedStyle(el).backgroundImage);
    return m ? m[1]! : null;
  });
  expect(url, "the band has a computed heritage URL").toMatch(/\/heritage\/heritage-light-desk\.v\d+\.(avif|webp)$/);

  await context.setOffline(true);
  offline = true;
  try {
    await page.reload();
    await expect(page.locator("[data-heritage]")).toBeAttached();
    const probe = await page.evaluate(async (u) => {
      const img = new Image();
      img.src = u;
      try {
        await img.decode();
      } catch {
        // naturalWidth stays 0 below; the assertion carries the failure.
      }
      return { naturalWidth: img.naturalWidth };
    }, url!);
    // Evidence for the report: where the offline copy came from (SW or HTTP cache).
    info.annotations.push({ type: "heritage-offline-responses", description: JSON.stringify(served.filter((s) => s.offline)) });
    expect(probe.naturalWidth, `${url} decodes offline`).toBeGreaterThan(0);
  } finally {
    await context.setOffline(false);
  }
});
