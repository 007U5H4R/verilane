import { test, expect, type Page } from "@playwright/test";

// TASK-79.1 · M4: the Dexie v1 → v2 upgrade (`src/store/db.ts`) in a real
// browser. A returning v1 user has `reviewItems` (not `exceptions`) in
// IndexedDB; opening the v2 app must upgrade the database in place, copy every
// ReviewItem into `exceptions` unchanged, keep payments and audit, and render
// the migrated rows on /exceptions and /exceptions/[id] with no console errors.
//
// The v1 data is realistic, not hand-made: the app seeds a fresh database, the
// rows are read back, made v1-shaped (no payment-raised kinds and no unapplied
// payments, which v1 could not hold), given user workflow state the seed never
// produces, and written into a raw IndexedDB built exactly as Dexie built v1.

/** Dexie stores IndexedDB version = declared version × 10. */
const V1_IDB_VERSION = 10;
const V2_IDB_VERSION = 20;

/** `version(1).stores(...)` from src/store/db.ts, pinned here: v1 is shipped
 * and must never change, so this test must not follow later edits to db.ts. */
const V1_STORES: Record<string, string> = {
  customers: "customer_id",
  invoices: "row_id, &invoice_number, customer_id, status",
  payments: "payment_id, invoice_id",
  emails: "message_id, thread_id",
  extractions: "message_id",
  matches: "message_id, invoice_id",
  priorities: "invoice_id, band",
  evidence: "evidence_id, claim_id, source_record_id",
  dataIssues: "++id, record_id",
  disputes: "dispute_id, invoice_id, status",
  drafts: "draft_id, invoice_id, status",
  reviewItems: "review_id, kind, status",
  audit: "++event_id, action, subject",
  meta: "key",
};

const PAYMENT_KINDS = ["unallocated_payment", "short_payment_pattern"];

type Row = Record<string, unknown>;
type Dump = Record<string, Row[]>;

async function waitForApp(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

/** Every store of the `verilane` database, read with raw IndexedDB. */
function readAll(page: Page): Promise<{ version: number; stores: string[]; rows: Dump }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("verilane");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const stores = [...db.objectStoreNames];
          const tx = db.transaction(stores);
          const rows: Record<string, Record<string, unknown>[]> = {};
          for (const name of stores) {
            const req = tx.objectStore(name).getAll();
            req.onsuccess = () => {
              rows[name] = req.result as Record<string, unknown>[];
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve({ version: db.version, stores: stores.sort(), rows });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

/** Deletes `verilane` and recreates it at IndexedDB version 10 with the v1
 * stores and indexes Dexie derives from `V1_STORES`, then writes `rows`. */
function writeV1(page: Page, stores: Record<string, string>, rows: Dump): Promise<void> {
  return page.evaluate(
    ({ stores, rows, version }) =>
      new Promise<void>((resolve, reject) => {
        const del = indexedDB.deleteDatabase("verilane");
        del.onblocked = () => reject(new Error("deleteDatabase blocked: an app connection is still open"));
        del.onerror = () => reject(del.error);
        del.onsuccess = () => {
          const open = indexedDB.open("verilane", version);
          open.onerror = () => reject(open.error);
          open.onupgradeneeded = () => {
            const db = open.result;
            for (const [name, spec] of Object.entries(stores)) {
              const [primary, ...indexes] = spec.split(",").map((s) => s.trim());
              const auto = primary!.startsWith("++");
              const store = db.createObjectStore(name, {
                keyPath: primary!.replace(/^\+\+/, ""),
                autoIncrement: auto,
              });
              for (const idx of indexes) {
                const unique = idx.startsWith("&");
                const keyPath = idx.replace(/^&/, "");
                store.createIndex(keyPath, keyPath, { unique });
              }
            }
          };
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(Object.keys(rows), "readwrite");
            for (const [name, list] of Object.entries(rows)) {
              for (const row of list) tx.objectStore(name).add(row);
            }
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
    { stores, rows, version: V1_IDB_VERSION },
  );
}

const byKey = (key: string) => (a: Row, b: Row) => String(a[key]).localeCompare(String(b[key]));

test("TASK-79.1 M4: a v1 database upgrades to v2 in the browser with nothing lost, and /exceptions renders it", async ({
  page,
}) => {
  // --- 1. Build a realistic v1 database ------------------------------------
  await waitForApp(page, "/exceptions");
  // User workflow state the seed never produces, written by the real command
  // path (status change + its audit row) plus a note: a reseed or a lossy
  // copy would drop it.
  const dismissedId = await page.evaluate(async (paymentKinds) => {
    const v = window.__verilane!;
    const open = await v.db.exceptions.where("status").equals("open").toArray();
    const pick =
      open.find((r) => !paymentKinds.includes(r.kind) && r.requires_role === "analyst") ??
      open.find((r) => !paymentKinds.includes(r.kind))!;
    await v.execute({ type: "dismiss_review", subject: { kind: "review", id: pick.review_id } });
    await v.db.audit.add({ action: "note", subject: "INV-A", text: "Called AP" });
    return pick.review_id;
  }, PAYMENT_KINDS);
  const seeded = await readAll(page);
  // Leave the app so it holds no connection; a static same-origin file keeps
  // the IndexedDB origin without booting the app.
  await page.goto("/seed/manifest.json");

  const s = seeded.rows;
  // v1 had no payment-raised kinds and Payment.invoice_id was a required
  // string, so the v1 shape drops both.
  const reviewItems = s.exceptions!.filter((r) => !PAYMENT_KINDS.includes(r.kind as string));
  expect(reviewItems.length, "the seed raises email-kind exceptions to migrate").toBeGreaterThanOrEqual(3);
  const dismissed = reviewItems.find((r) => r.review_id === dismissedId)!;
  expect(dismissed.status).toBe("dismissed");
  const payments = s.payments!.filter((p) => typeof p.invoice_id === "string");
  expect(payments.length).toBeGreaterThan(0);
  const audit = s.audit!;
  expect(audit.map((e) => e.subject)).toEqual(expect.arrayContaining([`review:${dismissedId}`, "INV-A"]));

  const v1: Dump = {};
  for (const name of Object.keys(V1_STORES)) {
    v1[name] = name === "reviewItems" ? reviewItems : name === "payments" ? payments : name === "audit" ? audit : (s[name] ?? []);
  }
  expect(v1.meta!.some((m) => m.key === "seedVersion"), "seeded, so the v2 app treats it as current").toBe(true);
  await writeV1(page, V1_STORES, v1);

  const before = await readAll(page);
  expect(before.version).toBe(V1_IDB_VERSION);
  expect(before.stores).toEqual(Object.keys(V1_STORES).sort());
  expect(before.rows.reviewItems).toHaveLength(reviewItems.length);

  // --- 2. Open the v2 app on the v1 database -------------------------------
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await waitForApp(page, "/exceptions");

  // --- 3. The database is upgraded -----------------------------------------
  const after = await readAll(page);
  expect(after.version).toBe(V2_IDB_VERSION);
  expect(after.stores).toContain("exceptions");
  expect(after.stores).toContain("creditNotes");
  expect(after.stores).toContain("policyDecisions");
  expect(after.stores).not.toContain("reviewItems");
  expect(await page.evaluate(() => window.__verilane!.db.verno)).toBe(2);

  // --- 4. Every ReviewItem is now an Exception, unchanged ------------------
  expect(after.rows.exceptions).toHaveLength(reviewItems.length);
  expect([...after.rows.exceptions!].sort(byKey("review_id"))).toEqual([...reviewItems].sort(byKey("review_id")));
  const openCount = reviewItems.filter((r) => r.status === "open").length;
  // The `status` index came across too: the app's indexed query finds them.
  expect(
    await page.evaluate(() => window.__verilane!.db.exceptions.where("status").equals("open").count()),
  ).toBe(openCount);

  // --- 5. Payments, audit and the rest are preserved -----------------------
  expect([...after.rows.payments!].sort(byKey("payment_id"))).toEqual([...payments].sort(byKey("payment_id")));
  expect(after.rows.audit).toEqual(audit);
  for (const name of Object.keys(V1_STORES)) {
    if (name === "reviewItems") continue;
    expect(after.rows[name], `${name} unchanged by the upgrade`).toEqual(before.rows[name]);
  }
  expect(after.rows.creditNotes).toEqual([]);
  expect(after.rows.policyDecisions).toEqual([]);

  // --- 6. The migrated rows render -----------------------------------------
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(page.getByTestId("exception-row")).toHaveCount(openCount);
  await expect(page.locator(`[data-testid="exception-row"][data-id="${dismissed.review_id}"]`)).toHaveCount(0);
  const target = reviewItems.find((r) => r.status === "open")!;
  const row = page.locator(`[data-testid="exception-row"][data-id="${target.review_id}"]`);
  await expect(row).toHaveCount(1);

  await row.getByRole("link", { name: /^Review / }).click();
  await expect(page).toHaveURL(new RegExp(`/exceptions/${target.review_id}$`));
  await expect(page.getByText(target.review_id as string, { exact: true })).toBeVisible();
  await expect(page.getByTestId("exception-status")).toHaveText(
    target.requires_role === "manager" ? "Pending Manager" : "Open",
  );
  await expect(page.getByTestId("exception-audit")).toBeVisible();

  // A deep link to the user-dismissed item still resolves, with its state.
  await waitForApp(page, `/exceptions/${dismissed.review_id}`);
  await expect(page.getByTestId("exception-status")).toHaveText("Dismissed");
  await expect(page.getByTestId("exception-audit")).toContainText(`Dismissed review item ${dismissedId}`);

  expect(consoleErrors).toEqual([]);
});
