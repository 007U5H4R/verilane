import { test, expect } from "@playwright/test";

const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

// TC-014: a DB seeded at 2026-10-30.0 with a user note, reloaded against the
// 2026-10-30.1 manifest, shows the prompt and keeps the note (never wipes).
test("a newer seed shows the update prompt and keeps the user's note", async ({ page }, testInfo) => {
  // First visit: serve the committed manifest relabelled as the older version.
  await page.route("**/seed/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...manifest, seedVersion: "2026-10-30.0" } });
  });
  await page.goto("/queue");
  // TASK-9: 25 rows per page; all 50 seeded rows are counted.
  await expect(page.locator('a[href^="/invoices/"]')).toHaveCount(25);
  await expect(page.getByTestId("result-count")).toHaveText("50 of 50 shown");
  await expect(page.getByText("New demo data available")).toHaveCount(0);

  // A user note, written straight to the audit table.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("verilane");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("audit", "readwrite");
          tx.objectStore("audit").add({ action: "note", subject: "INV-A", text: "Called AP" });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  // Reload against the real (newer) manifest.
  await page.unroute("**/seed/manifest.json");
  await page.reload();

  const prompt = page.getByRole("status").filter({ hasText: "New demo data available" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("button", { name: "Reset" })).toBeDisabled();
  await expect(prompt.getByText("Reset arrives with Settings")).toBeVisible();
  await expect(page.locator('a[href^="/invoices/"]')).toHaveCount(25);
  await expect(page.getByTestId("result-count")).toHaveText("50 of 50 shown");

  const stored = await page.evaluate(
    () =>
      new Promise<{ notes: number; seedVersion: unknown }>((resolve, reject) => {
        const open = indexedDB.open("verilane");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["audit", "meta"]);
          const audit = tx.objectStore("audit").getAll();
          const meta = tx.objectStore("meta").get("seedVersion");
          tx.oncomplete = () => {
            db.close();
            const notes = (audit.result as { action: string }[]).filter((e) => e.action === "note");
            resolve({ notes: notes.length, seedVersion: (meta.result as { value: unknown })?.value });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  expect(stored).toEqual({ notes: 1, seedVersion: "2026-10-30.0" });

  await page.screenshot({ path: `${REPORTS_DIR}/TASK-8-seed-update-${testInfo.project.name}.png` });
});
