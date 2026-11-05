import { test, expect } from "@playwright/test";

const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

test("queue route loads", async ({ page }) => {
  const response = await page.goto("/queue");
  expect(response?.ok()).toBe(true);
});

// TASK-8: the full seed (TC-011) renders as 50 rows, in rank order (TC-006).
// TASK-9: the Queue pages at 25 rows, so the 50 rows span pages 1 and 2.
test("queue renders all 50 seed invoices in rank order", async ({ page }, testInfo) => {
  await page.goto("/queue");
  const rows = page.locator('a[href^="/invoices/"]');
  const hrefs = () =>
    rows.evaluateAll((links) => links.map((a) => (a.getAttribute("href") ?? "").replace("/invoices/", "")));
  await expect(rows).toHaveCount(25);
  const page1 = await hrefs();
  await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 2 of 2");
  await expect(rows).toHaveCount(25);
  const shown = [...page1, ...(await hrefs())];
  expect(shown).toHaveLength(50);

  // Independent oracle: re-sort the stored priorities with rank()'s
  // comparator (score ↓, days overdue ↓, outstanding ↓, invoice_number ↑).
  const expected = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("verilane");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all = <T,>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      });
    type Inv = { invoice_id: string; invoice_number: string | null; amount_paise: number };
    type Pri = { invoice_id: string; score?: number; days_overdue: number | null };
    // TKT-75.02: an unapplied bank line (P-012) has no invoice.
    type Pay = { invoice_id: string | null; amount_paise: number };
    const [invoices, priorities, payments] = await Promise.all([
      all<Inv>("invoices"),
      all<Pri>("priorities"),
      all<Pay>("payments"),
    ]);
    db.close();
    const paid = new Map<string, number>();
    for (const p of payments) {
      if (p.invoice_id !== null) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount_paise);
    }
    const pri = new Map(priorities.map((p) => [p.invoice_id, p]));
    const key = (i: Inv) => {
      const p = pri.get(i.invoice_id);
      return {
        score: p?.score ?? -Infinity,
        days: p?.days_overdue ?? -Infinity,
        out: i.amount_paise - (paid.get(i.invoice_id) ?? 0),
        num: i.invoice_number ?? "",
      };
    };
    return [...invoices]
      .sort((x, y) => {
        const a = key(x);
        const b = key(y);
        if (a.score !== b.score) return b.score - a.score;
        if (a.days !== b.days) return b.days - a.days;
        if (a.out !== b.out) return b.out - a.out;
        return a.num < b.num ? -1 : a.num > b.num ? 1 : 0;
      })
      .map((i) => i.invoice_id);
  });

  expect(shown).toEqual(expected);
  // Worked example A (60/high) outranks B (15/low).
  expect(shown.indexOf("INV-A")).toBeLessThan(shown.indexOf("INV-B"));

  await page.screenshot({
    path: `${REPORTS_DIR}/TASK-8-queue-50-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
