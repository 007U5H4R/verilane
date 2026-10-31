import { test, expect, type Page } from "@playwright/test";

// TC-010 · Tracer: seed → Queue → Investigation provenance (production build).
// Seed-agnostic on purpose: rank order and row numbers are checked against
// the stored priorities and the served CSV, not hard-coded seed values.

const INVOICE_FACT_FIELDS = [
  "invoice_number",
  "invoice_date",
  "due_date",
  "amount_paise",
  "currency",
  "status_raw",
];

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** `invoice_id → row_id` from the CSV the app loads. */
async function csvRowIds(page: Page): Promise<Map<string, string>> {
  const res = await page.request.get("/seed/invoices.csv");
  expect(res.ok()).toBe(true);
  const [header = "", ...lines] = (await res.text()).trim().split(/\r?\n/);
  const cols = header.split(",");
  const rowIdCol = cols.indexOf("row_id");
  const idCol = cols.indexOf("invoice_id");
  return new Map(
    lines.map((line) => {
      const cells = line.split(",");
      return [cells[idCol] ?? "", cells[rowIdCol] ?? ""];
    }),
  );
}

interface StoredPriority {
  invoice_id: string;
  score?: number;
  days_overdue: number | null;
}

async function storedPriorities(page: Page): Promise<Map<string, StoredPriority>> {
  const all = await page.evaluate(
    () =>
      new Promise<StoredPriority[]>((resolve, reject) => {
        const open = indexedDB.open("verilane");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("priorities").objectStore("priorities").getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result as StoredPriority[]);
        };
      }),
  );
  return new Map(all.map((p) => [p.invoice_id, p]));
}

test("TC-010: queue rows rank in order and Investigation shows provenance", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  await page.goto("/queue");
  const rows = page.locator('a[href^="/invoices/"]');
  await expect(rows.first()).toBeVisible();

  // Rank order: (score desc, days overdue desc) — rank()'s first two keys.
  const ids = (await rows.evaluateAll((els) => els.map((el) => el.getAttribute("href")))).map(
    (href) => decodeURIComponent((href ?? "").replace("/invoices/", "")),
  );
  expect(ids.length).toBeGreaterThan(1);
  const priorities = await storedPriorities(page);
  const keys = ids.map((id) => {
    const p = priorities.get(id);
    expect(p, `priority for ${id}`).toBeDefined();
    return [p?.score ?? -Infinity, p?.days_overdue ?? -Infinity] as const;
  });
  for (let i = 1; i < keys.length; i++) {
    const [prevScore, prevDays] = keys[i - 1] ?? [];
    const [score, days] = keys[i] ?? [];
    expect(score! <= prevScore!, `${ids[i]} ranks below ${ids[i - 1]}`).toBe(true);
    if (score === prevScore) expect(days! <= prevDays!).toBe(true);
  }

  // Every row has a priority chip: a dot plus a text label.
  for (const row of await rows.all()) {
    const chip = row.locator('[data-slot="badge"]').first();
    await expect(chip.locator('span[aria-hidden="true"]')).toHaveCount(1);
    await expect(chip).toHaveText(/\S/);
  }

  // Click the top row → Investigation.
  const topId = ids[0]!;
  await rows.first().click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${topId}$`));

  await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);

  const rowNo = (await csvRowIds(page)).get(topId);
  expect(rowNo, `${topId} in invoices.csv`).toBeTruthy();

  const factsTable = page.locator('section[aria-labelledby="ev-invoice-facts"]');
  await expect(factsTable.locator("tr[data-field]")).toHaveCount(INVOICE_FACT_FIELDS.length);
  for (const field of INVOICE_FACT_FIELDS) {
    await expect(
      factsTable.locator(`tr[data-field="${field}"]`).getByTestId("provenance"),
    ).toHaveText(`invoices.csv · Row ${rowNo} · ${field}`);
  }

  expect(errors).toEqual([]);
});

test("Investigation shows not-found for an unknown invoice id", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.locator('a[href^="/invoices/"]').first()).toBeVisible();

  await page.goto("/invoices/INV-DOES-NOT-EXIST");
  await expect(page.getByRole("heading", { name: "Invoice not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to queue/ })).toHaveAttribute("href", "/queue");
});
