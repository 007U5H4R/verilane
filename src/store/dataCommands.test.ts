/**
 * TASK-19.2 gates on fake-indexeddb: `import_csv` (TC-057 / TC-058, store
 * half), `reset_demo` (TC-060) and `set_as_of` (TC-061) — each audited,
 * each atomic.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidCommand } from "@/domain/commands";
import { VerilaneDb } from "./db";
import { importCsv, resetDemo, setAsOf } from "./dataCommands";
import { ensureSeeded, type Fetcher, type SeedManifest } from "./loader";
import { execute } from "./tx";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests/e2e/fixtures", name), "utf8");

const MANIFEST: SeedManifest = {
  seedVersion: "test.1",
  invoices: "/seed/invoices.csv",
  customers: "/seed/customers.csv",
  payments: "/seed/payments.csv",
  emails: "/seed/emails.json",
};

const FILES: Record<string, string> = {
  "/seed/manifest.json": JSON.stringify(MANIFEST),
  "/seed/customers.csv": "customer_id,name,contact_emails,payment_terms_days,segment\nC-001,Acme Co,ap@acme.test,30,SMB",
  "/seed/invoices.csv": [
    "row_id,invoice_id,invoice_number,customer_id,invoice_date,due_date,amount_paise,currency,status_raw,outstanding_amount,billing_period,po_number",
    "1,INV-A,1001,C-001,2026-01-01,2026-09-13,34000000,INR,open,,,",
    "2,INV-B,1002,C-001,2026-01-01,2026-10-20,4000000,INR,open,,,",
    "3,INV-C,,C-001,2026-01-01,2026-10-25,1000000,INR,open,,,",
  ].join("\n"),
  "/seed/payments.csv": "payment_id,invoice_id,paid_on,amount_paise",
  "/seed/emails.json": "[]",
};

const fetcher = (async (url: string | URL | Request) => {
  const body = FILES[String(url)];
  return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
}) as Fetcher;

let db: VerilaneDb;

beforeEach(async () => {
  db = new VerilaneDb(`verilane-data-${Math.random()}`);
  await ensureSeeded(db, fetcher);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

async function snapshot() {
  return {
    invoices: await db.invoices.orderBy("row_id").toArray(),
    priorities: await db.priorities.orderBy("invoice_id").toArray(),
    // Auto-increment ids differ after a rewrite; compare the content only.
    dataIssues: (await db.dataIssues.toArray()).map((issue) => {
      const rest: Partial<typeof issue> = { ...issue };
      delete rest.id;
      return rest;
    }),
  };
}

describe("import_csv — TC-057 a bad file is rejected whole", () => {
  it("writes nothing but an import_rejected audit event listing row/field/reason", async () => {
    const before = await snapshot();
    const result = await importCsv(db, "invoices", "bad-invoices.csv", fixture("bad-invoices.csv"));
    expect(result.ok).toBe(false);
    expect(await snapshot()).toEqual(before);

    const events = await db.audit.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "import_rejected", subject: "system:import" });
    const errors = (events[0]?.after as { errors: unknown[] }).errors;
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 3, field: "invoice_date" }),
        expect.objectContaining({ row: 7, field: "amount_paise" }),
      ]),
    );
  });
});

describe("import_csv — TC-058 a good file replaces the data", () => {
  it("replaces invoices, recomputes priorities and audits import_csv", async () => {
    const result = await importCsv(db, "invoices", "good-invoices.csv", fixture("good-invoices.csv"));
    expect(result.ok).toBe(true);
    const ids = (await db.invoices.toArray()).map((i) => i.invoice_id).sort();
    expect(ids).toEqual(["INV-901", "INV-902", "INV-903", "INV-904", "INV-905", "INV-906"]);
    const prio = (await db.priorities.toArray()).map((p) => p.invoice_id).sort();
    expect(prio).toEqual(ids);
    // The seed's FS1 issue for INV-C (blank number) is gone with its invoice.
    expect((await db.dataIssues.toArray()).some((d) => d.record_id === "INV-C")).toBe(false);
    const last = await db.audit.orderBy("event_id").last();
    expect(last).toMatchObject({ action: "import_csv", after: { kind: "invoices", rows: 6 } });
  });

  it("re-validates rows in the command, so a direct call cannot write bad data", async () => {
    await expect(
      execute(db, {
        type: "import_csv",
        subject: { kind: "system", id: "import" },
        payload: { kind: "invoices", file_name: "x.csv", rows: [{ invoice_id: "X" }], data_issues: [] },
      }),
    ).rejects.toBeInstanceOf(InvalidCommand);
    expect(await db.invoices.count()).toBe(3);
    expect(await db.audit.count()).toBe(0);
  });
});

describe("reset_demo — TC-060", () => {
  it("restores the fresh seed and demo_reset is the first audit event", async () => {
    const fresh = await snapshot();
    await db.meta.put({ key: "role", value: "manager" });
    await db.drafts.put({ draft_id: "DR-1", invoice_id: "INV-A", status: "validated" });
    await execute(db, { type: "add_note", subject: { kind: "invoice", id: "INV-A" }, payload: { text: "Called" } });
    await execute(db, { type: "approve_draft", subject: { kind: "draft", id: "DR-1" } });
    await setAsOf(db, "2026-11-15");
    await importCsv(db, "invoices", "good-invoices.csv", fixture("good-invoices.csv"));

    await resetDemo(db, fetcher);

    expect(await snapshot()).toEqual(fresh);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.meta.get("asOf")).toBeUndefined();
    expect((await db.meta.get("seedVersion"))?.value).toBe("test.1");
    expect((await db.meta.get("role"))?.value).toBe("manager");
    const events = await db.audit.orderBy("event_id").toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "demo_reset", actor_role: "manager" });
  });

  it("reloads an emptied database (the Queue's Load demo data path, R5)", async () => {
    await db.invoices.clear();
    await db.priorities.clear();
    await resetDemo(db, fetcher);
    expect(await db.invoices.count()).toBe(3);
    expect(await db.priorities.count()).toBe(3);
    expect((await db.audit.toArray()).map((e) => e.action)).toEqual(["demo_reset"]);
  });
});

describe("set_as_of — TC-061", () => {
  it("moves days overdue, re-ranks and audits before/after", async () => {
    const before = await db.priorities.get("INV-B");
    await setAsOf(db, "2026-11-15");
    const after = await db.priorities.get("INV-B");
    expect(after?.days_overdue).toBe((before?.days_overdue ?? 0) + 16);
    const last = await db.audit.orderBy("event_id").last();
    expect(last).toMatchObject({
      action: "set_as_of",
      before: { as_of: "2026-10-30" },
      after: { as_of: "2026-11-15" },
    });
    expect((await db.meta.get("asOf"))?.value).toBe("2026-11-15");
  });

  it("null restores the default date", async () => {
    await setAsOf(db, "2026-11-15");
    await setAsOf(db, null);
    expect((await db.meta.get("asOf"))?.value).toBe("2026-10-30");
    expect((await db.priorities.get("INV-B"))?.days_overdue).toBe(10);
  });

  it("rejects an impossible date and an unchanged date, writing nothing", async () => {
    await expect(setAsOf(db, "2026-02-30")).rejects.toBeInstanceOf(InvalidCommand);
    await expect(setAsOf(db, "2026-10-30")).rejects.toBeInstanceOf(InvalidCommand);
    expect(await db.audit.count()).toBe(0);
  });
});
