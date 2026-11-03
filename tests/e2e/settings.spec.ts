import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

// TASK-19 (TKT-14): CSV import, reset and the as-of override, driven through
// the Settings UI. TC numbers follow test-cases.md.
const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";
const FIXTURES = path.resolve("tests/e2e/fixtures");

async function bridge(page: Page) {
  await page.waitForFunction(() => window.__verilane !== undefined);
}

async function auditActions(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.__verilane!.db.audit.orderBy("event_id").toArray().then((rows) => rows.map((r) => String(r.action))),
  );
}

async function openSettings(page: Page) {
  await page.goto("/settings");
  await bridge(page);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
}

// TASK-38: picking a file previews it (an invalid file is rejected and
// audited on pick); a valid file imports only after "Confirm import".
async function importFile(page: Page, table: string, file: string, { valid = true } = {}) {
  const section = page.locator("#import");
  await section.getByLabel("Table").selectOption({ label: table });
  await section.getByLabel("CSV file").setInputFiles(path.join(FIXTURES, file));
  if (!valid) return;
  await section.getByRole("button", { name: "Import" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm import" }).click();
}

/** Queue page-1 invoice ids, in rendered order. */
async function queueOrder(page: Page): Promise<string[]> {
  const hrefs = await page.locator('a[href^="/invoices/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  return hrefs.map((h) => String(h).replace("/invoices/", ""));
}

test("TC-057: a bad invoices file is rejected whole, with a row/field/reason list", async ({ page }, info) => {
  await openSettings(page);
  const before = await page.evaluate(() => window.__verilane!.db.invoices.count());

  await importFile(page, "Invoices", "bad-invoices.csv", { valid: false });

  const errors = page.getByTestId("import-errors");
  await expect(errors).toBeVisible();
  await expect(errors).toContainText("bad-invoices.csv was rejected");
  // Missing column (header), bad date on row 3, negative amount on row 7.
  await expect(errors.getByRole("row").filter({ hasText: "Header" }).filter({ hasText: "currency" })).toHaveCount(1);
  await expect(errors.getByRole("row").filter({ hasText: "invoice_date" }).first()).toContainText("3");
  await expect(errors.getByRole("row").filter({ hasText: "amount_paise" }).first()).toContainText("7");

  expect(await page.evaluate(() => window.__verilane!.db.invoices.count())).toBe(before);
  const ids = await page.evaluate(() => window.__verilane!.db.invoices.toCollection().primaryKeys());
  expect(ids.some((id) => String(id).startsWith("INV-9"))).toBe(false);
  expect((await auditActions(page)).at(-1)).toBe("import_rejected");
  await page.screenshot({ path: `${SHOTS}/TASK-19-tc057-${info.project.name}.png`, fullPage: true });
});

test("TC-058: a good invoices file replaces the data and the Queue shows it", async ({ page }, info) => {
  // The Queue entry point leads to the Settings import section.
  await page.goto("/queue");
  await expect(page.getByTestId("result-count")).toHaveText("50 of 50 shown");
  await page.getByRole("link", { name: "Import data" }).click();
  await expect(page).toHaveURL(/\/settings#import$/);
  await bridge(page);

  await importFile(page, "Invoices", "good-invoices.csv");
  await expect(page.getByRole("status").filter({ hasText: "Imported 6 rows from good-invoices.csv" })).toBeVisible();
  expect((await auditActions(page)).at(-1)).toBe("import_csv");
  // Recompute ran: one priority per imported invoice.
  expect(await page.evaluate(() => window.__verilane!.db.priorities.count())).toBe(6);
  await page.screenshot({ path: `${SHOTS}/TASK-19-tc058-settings-${info.project.name}.png`, fullPage: true });

  await page.getByRole("link", { name: "Queue" }).first().click();
  await expect(page.getByTestId("result-count")).toHaveText("6 of 6 shown");
  const order = await queueOrder(page);
  expect([...order].sort()).toEqual(["INV-901", "INV-902", "INV-903", "INV-904", "INV-905", "INV-906"]);
  await page.screenshot({ path: `${SHOTS}/TASK-19-tc058-queue-${info.project.name}.png`, fullPage: true });
});

test("TC-060: Reset behind a confirmation restores the fresh seed", async ({ page }, info) => {
  await openSettings(page);
  const fresh = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    return { invoices: await db.invoices.orderBy("row_id").toArray(), priorities: await db.priorities.toArray() };
  });

  // Add a note and approve a draft (as Manager) through the audited commands.
  await page.evaluate(async () => {
    const v = window.__verilane!;
    // A real generated + submitted draft: approve re-runs the nine checks (TASK-16).
    await v.execute({ type: "generate_draft", subject: { kind: "invoice", id: "INV-A" } });
    await v.execute({ type: "submit_draft", subject: { kind: "draft", id: "DR-INV-A-1" } });
    await v.execute({ type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "manager" } });
    await v.execute({ type: "add_note", subject: { kind: "invoice", id: "INV-A" }, payload: { text: "Called AP" } });
    await v.execute({ type: "approve_draft", subject: { kind: "draft", id: "DR-INV-A-1" } });
  });
  expect(await auditActions(page)).toEqual(expect.arrayContaining(["add_note", "approve_draft"]));

  const section = page.locator("#reset");
  // Cancel changes nothing.
  await section.getByRole("button", { name: "Reset demo data" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reset workspace demo data?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.__verilane!.db.drafts.count())).toBe(1);

  await section.getByRole("button", { name: "Reset demo data" }).click();
  await page.screenshot({ path: `${SHOTS}/TASK-19-tc060-confirm-${info.project.name}.png` });
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Demo data reset." })).toBeVisible();

  const after = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    return {
      invoices: await db.invoices.orderBy("row_id").toArray(),
      priorities: await db.priorities.toArray(),
      drafts: await db.drafts.count(),
    };
  });
  expect(after.invoices).toEqual(fresh.invoices);
  expect(after.priorities).toEqual(fresh.priorities);
  expect(after.drafts).toBe(0);
  const actions = await auditActions(page);
  expect(actions[0]).toBe("demo_reset");
  expect(actions).not.toContain("add_note");
});

test("TC-060: the seed-update prompt's Reset uses the same confirmed path", async ({ page }) => {
  // Seed as an older version so the prompt appears on the next load.
  await page.route("**/seed/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...manifest, seedVersion: "2026-10-30.0" } });
  });
  await page.goto("/queue");
  await expect(page.getByTestId("result-count")).toHaveText("50 of 50 shown");
  await page.unroute("**/seed/manifest.json");
  await page.reload();
  await bridge(page);

  const prompt = page.getByRole("status").filter({ hasText: "New demo data available" });
  await prompt.getByRole("button", { name: "Reset" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reset workspace demo data?" });
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  // The open dialog hides the page from the a11y tree, so wait for it to
  // close before checking the prompt has gone.
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Demo data reset." })).toBeVisible();
  await expect(page.getByText("New demo data available")).toHaveCount(0);

  const state = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const first = await db.audit.orderBy("event_id").first();
    return { first: first?.action, seed: (await db.meta.get("seedVersion"))?.value };
  });
  expect(state.first).toBe("demo_reset");
  expect(state.seed).not.toBe("2026-10-30.0");
});

test("TC-061: an as-of override re-ranks the queue and is audited", async ({ page }, info) => {
  await page.goto("/queue");
  await bridge(page);
  await expect(page.getByTestId("result-count")).toHaveText("50 of 50 shown");
  await expect(page.getByTestId("as-of-label")).toHaveText("As of 30 Oct 2026");
  const orderBefore = await queueOrder(page);
  // An invoice that is already overdue: its days overdue must grow by 16.
  const probe = await page.evaluate(async () => {
    const rows = await window.__verilane!.db.priorities.toArray();
    const hit = rows.find((r) => typeof r.days_overdue === "number" && r.days_overdue > 0);
    return { id: String(hit?.invoice_id), days: Number(hit?.days_overdue) };
  });

  await page.goto("/settings#as-of");
  await bridge(page);
  const section = page.locator("#as-of");
  await section.getByLabel("As-of date").fill("2026-11-15");
  await section.getByRole("button", { name: "Apply" }).click();
  await expect(section.getByText("Currently 15 Nov 2026.")).toBeVisible();
  await expect(page.getByTestId("as-of-label")).toHaveText("As of 15 Nov 2026");
  expect((await auditActions(page)).at(-1)).toBe("set_as_of");
  await page.screenshot({ path: `${SHOTS}/TASK-19-tc061-settings-${info.project.name}.png`, fullPage: true });

  const days = await page.evaluate(
    (id) => window.__verilane!.db.priorities.get(id).then((p) => p?.days_overdue),
    probe.id,
  );
  expect(days).toBe(probe.days + 16);

  await page.getByRole("link", { name: "Queue" }).first().click();
  await expect(page.getByTestId("result-count")).toHaveText("50 of 50 shown");
  await expect(page.getByText("Ranked by priority.v1 · as of 15 Nov 2026")).toBeVisible();
  expect(await queueOrder(page)).not.toEqual(orderBefore);
  await page.screenshot({ path: `${SHOTS}/TASK-19-tc061-queue-${info.project.name}.png`, fullPage: true });
});
