/**
 * TASK-7.6 gate: `ensureSeeded()` loads a fixture seed (fake-indexeddb,
 * wired globally via src/test/setup.ts), row counts land in the right
 * tables, and the `&invoice_number` unique constraint holds.
 *
 * TASK-7.7 gate: the same loader against the real `public/seed/*` files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VerilaneDb } from "./db";
import { ensureSeeded, recompute, type Fetcher, type SeedManifest } from "./loader";
import { execute } from "./tx";
import { paise } from "@/domain/money";

const CUSTOMERS_CSV = ["customer_id,name,contact_emails,payment_terms_days,segment", "C-001,Acme Co,ap@acme.test,30,SMB"].join("\n");

const INVOICES_CSV = [
  "row_id,invoice_id,invoice_number,customer_id,invoice_date,due_date,amount_paise,currency,status_raw,outstanding_amount,billing_period,po_number",
  "1,INV-A,1001,C-001,2026-01-01,2026-09-13,34000000,INR,open,,,",
  "2,INV-B,1002,C-001,2026-01-01,2026-10-20,4000000,INR,open,,,",
].join("\n");

const PAYMENTS_CSV = ["payment_id,invoice_id,paid_on,amount_paise"].join("\n");

const EMAILS_JSON: unknown[] = [];

const MANIFEST: SeedManifest = {
  seedVersion: "test.0",
  invoices: "/seed/invoices.csv",
  customers: "/seed/customers.csv",
  payments: "/seed/payments.csv",
  emails: "/seed/emails.json",
};

function makeFetcher(manifest: SeedManifest = MANIFEST): Fetcher {
  const files: Record<string, string> = {
    "/seed/manifest.json": JSON.stringify(manifest),
    "/seed/invoices.csv": INVOICES_CSV,
    "/seed/customers.csv": CUSTOMERS_CSV,
    "/seed/payments.csv": PAYMENTS_CSV,
    "/seed/emails.json": JSON.stringify(EMAILS_JSON),
  };
  return (async (url: string | URL | Request) => {
    const key = String(url);
    const body = files[key];
    if (body === undefined) {
      return new Response(null, { status: 404 });
    }
    return new Response(body, { status: 200 });
  }) as Fetcher;
}

let db: VerilaneDb;

beforeEach(() => {
  db = new VerilaneDb(`verilane-test-${Math.random()}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("ensureSeeded — TASK-7.6", () => {
  it("loads the fixture seed on first run and records the seed version", async () => {
    const result = await ensureSeeded(db, makeFetcher());
    expect(result).toBe("seeded");

    expect(await db.customers.count()).toBe(1);
    expect(await db.invoices.count()).toBe(2);
    expect(await db.payments.count()).toBe(0);
    expect(await db.priorities.count()).toBe(2);

    const meta = await db.meta.get("seedVersion");
    expect(meta?.value).toBe("test.0");
  });

  it("returns 'current' on a second run at the same seed version", async () => {
    await ensureSeeded(db, makeFetcher());
    const result = await ensureSeeded(db, makeFetcher());
    expect(result).toBe("current");
    expect(await db.invoices.count()).toBe(2); // not re-seeded.
  });

  it("returns 'update-available' without wiping when the manifest version changes (TC-014)", async () => {
    await ensureSeeded(db, makeFetcher());
    const newerManifest: SeedManifest = { ...MANIFEST, seedVersion: "test.1" };
    const result = await ensureSeeded(db, makeFetcher(newerManifest));
    expect(result).toBe("update-available");
    expect(await db.invoices.count()).toBe(2); // never auto-wiped.
  });

  it("enforces &invoice_number uniqueness", async () => {
    await ensureSeeded(db, makeFetcher());
    await expect(
      db.invoices.add({
        row_id: 99,
        invoice_id: "INV-DUP",
        invoice_number: "1001", // duplicate of INV-A's.
        customer_id: "C-001",
        invoice_date: "2026-01-01",
        due_date: "2026-10-01",
        amount_paise: paise(1),
        currency: "INR",
        status_raw: "open",
        status: "open",
        billing_period: null,
        po_number: null,
      }),
    ).rejects.toThrow();
  });
});

describe("ensureSeeded — TASK-7.7 (real public/seed files)", () => {
  function realFetcher(): Fetcher {
    const seedDir = join(process.cwd(), "public", "seed");
    const files: Record<string, string> = {
      "/seed/manifest.json": readFileSync(join(seedDir, "manifest.json"), "utf-8"),
      "/seed/invoices.csv": readFileSync(join(seedDir, "invoices.csv"), "utf-8"),
      "/seed/customers.csv": readFileSync(join(seedDir, "customers.csv"), "utf-8"),
      "/seed/payments.csv": readFileSync(join(seedDir, "payments.csv"), "utf-8"),
      "/seed/emails.json": readFileSync(join(seedDir, "emails.json"), "utf-8"),
    };
    return (async (url: string | URL | Request) => {
      const key = String(url);
      const body = files[key];
      if (body === undefined) return new Response(null, { status: 404 });
      return new Response(body, { status: 200 });
    }) as Fetcher;
  }

  it("two racing first-run loads write the seed once — no duplicate data issues (M-001 R4)", async () => {
    const single = new VerilaneDb(`verilane-single-${Math.random()}`);
    await ensureSeeded(single, realFetcher());
    const expected = await single.dataIssues.count();
    single.close();
    await single.delete();
    expect(expected).toBeGreaterThan(0);

    const results = await Promise.all([ensureSeeded(db, realFetcher()), ensureSeeded(db, realFetcher())]);
    expect(results.sort()).toEqual(["current", "seeded"]);
    expect(await db.dataIssues.count()).toBe(expected);
    const ids = (await db.dataIssues.toArray()).map((d) => d.issue_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("loads the real seed files: counts match, seedVersion recorded, every invoice has a priority", async () => {
    const result = await ensureSeeded(db, realFetcher());
    expect(result).toBe("seeded");

    expect(await db.customers.count()).toBe(10);
    expect(await db.invoices.count()).toBe(50);
    expect(await db.payments.count()).toBe(16); // P-012: unapplied bank line (TKT-75.02); P-013..P-016: FS14–FS17 (TKT-75.08)
    expect(await db.emails.count()).toBeGreaterThanOrEqual(25);
    expect(await db.priorities.count()).toBe(50);

    const meta = await db.meta.get("seedVersion");
    expect(meta?.value).toBe("2026-11-07.1");

    // FS1 (missing invoice_number) + FS2 (missing due_date) + FS8 (conflicting
    // outstanding_amount) + FS10 (unrecognized status_raw) each raised.
    const issues = await db.dataIssues.toArray();
    expect(issues.some((i) => i.field === "invoice_number" && i.kind === "missing")).toBe(true);
    expect(issues.some((i) => i.field === "due_date" && i.kind === "missing")).toBe(true);
    expect(issues.some((i) => i.field === "outstanding_amount" && i.kind === "conflict")).toBe(true);
    expect(issues.some((i) => i.field === "status_raw" && i.kind === "unparseable")).toBe(true);
  });

  it("TASK-12.5: writes one validated simulated extraction per email", async () => {
    await ensureSeeded(db, realFetcher());
    const emails = await db.emails.count();
    const rows = await db.extractions.toArray();
    expect(rows).toHaveLength(emails);
    expect(rows.every((r) => r.mode === "simulated" && r.schemaVersion === "extraction.v1")).toBe(true);
    expect(rows.every((r) => r.status === "valid")).toBe(true);
    const e7 = rows.find((r) => r.thread_id === "E-007");
    expect(e7).toMatchObject({ invoice_refs: ["INV-1042"], amounts: [30_000_000] });
  });

  it("TASK-12.5: recompute() rebuilds extractions from the emails table", async () => {
    await ensureSeeded(db, realFetcher());
    await db.extractions.clear();
    await recompute(db);
    expect(await db.extractions.count()).toBe(await db.emails.count());
  });

  it("keeps the worked-example scores: INV-A 70/high (broken promise), INV-B 15/low, INV-E needs review", async () => {
    await ensureSeeded(db, realFetcher());
    const a = await db.priorities.get("INV-A");
    expect(a).toMatchObject({ score: 70, band: "high" });
    expect(a?.factors.some((f) => f.evidenceId === "E-001-1:emails.json:commitment_date")).toBe(true);
    const b = await db.priorities.get("INV-B");
    expect(b).toMatchObject({ score: 15, band: "low" });
    const e = await db.priorities.get("INV-E");
    expect(e).toMatchObject({ band: "needs_review", gate: "G3" });
  });

  it("TC-014: a newer manifest reports update-available and keeps a user note (never wipes)", async () => {
    const olderManifest = JSON.stringify({
      ...(JSON.parse(readFileSync(join(process.cwd(), "public", "seed", "manifest.json"), "utf-8")) as SeedManifest),
      seedVersion: "2026-10-30.0",
    });
    const real = realFetcher();
    const olderFetcher = (async (url: string | URL | Request) =>
      String(url) === "/seed/manifest.json" ? new Response(olderManifest, { status: 200 }) : real(url)) as Fetcher;

    expect(await ensureSeeded(db, olderFetcher)).toBe("seeded");
    await db.audit.add({ action: "note", subject: "INV-A", text: "Called AP, promised Friday" });

    expect(await ensureSeeded(db, real)).toBe("update-available");
    expect(await db.invoices.count()).toBe(50);
    expect(await db.audit.where("action").equals("note").count()).toBe(1);
    expect((await db.meta.get("seedVersion"))?.value).toBe("2026-10-30.0");
  });

  it("TC-013: a bulkAdd of a duplicate invoice_number throws ConstraintError", async () => {
    await ensureSeeded(db, realFetcher());
    const a = await db.invoices.where("invoice_number").equals("INV-1012").first();
    expect(a?.invoice_id).toBe("INV-A");
    await expect(
      db.invoices.bulkAdd([{ ...a!, row_id: 999, invoice_id: "INV-DUP" }]),
    ).rejects.toMatchObject({
      failures: [expect.objectContaining({ name: "ConstraintError" })],
    });
  });

  it("TASK-13: writes one match per email and gates the seed's dispute, claim and data conflict", async () => {
    await ensureSeeded(db, realFetcher());
    expect(await db.matches.count()).toBe(await db.emails.count());

    const disputed = await db.priorities.get("INV-C");
    expect(disputed).toMatchObject({ gate: "G4", band: "disputed" });
    // TASK-17: the dispute email now opens a real Dispute row (D-E-011-1),
    // whose record the gate cites instead of the raw email evidence.
    expect(disputed?.reason).toContain("dispute D-E-011-1");

    expect(await db.priorities.get("INV-042")).toMatchObject({ gate: "G5", band: "hold_reconcile" });
    // R1: seed row 10's outstanding_amount conflict holds INV-G for reconcile.
    const g = await db.priorities.get("INV-G");
    expect(g).toMatchObject({ gate: "G5", band: "hold_reconcile" });
    expect(g?.reason).toContain("row 10 · outstanding_amount");
  });

  it("TC-030: the E-007 claim becomes a reconciliation item with both amounts; the ledger is untouched", async () => {
    await ensureSeeded(db, realFetcher());
    const items = await db.exceptions.where("kind").equals("reconciliation").toArray();
    const e7 = items.find((r) => r.message_id === "E-007-1");
    expect(e7).toMatchObject({
      invoice_id: "INV-042",
      email_amount_paise: 30_000_000,
      ledger_outstanding_paise: 34_000_000,
    });
    expect(await db.payments.where("invoice_id").equals("INV-042").count()).toBe(0);
  });

  it("every non-matched email has an uncertain_match review item", async () => {
    await ensureSeeded(db, realFetcher());
    const unmatched = (await db.matches.toArray()).filter((m) => m.outcome !== "matched");
    expect(unmatched.length).toBeGreaterThan(0);
    const uncertain = await db.exceptions.where("kind").equals("uncertain_match").toArray();
    expect(uncertain.map((r) => r.message_id).sort()).toEqual(unmatched.map((m) => m.message_id).sort());
  });

  it("TC-75.07: one unallocated_payment exception per unapplied payment, stable across recomputes", async () => {
    await ensureSeeded(db, realFetcher());
    const unapplied = (await db.payments.toArray()).filter((p) => p.invoice_id === null);
    const first = await db.exceptions.where("kind").equals("unallocated_payment").toArray();
    expect(first.map((x) => x.payment_id).sort()).toEqual(unapplied.map((p) => p.payment_id).sort());
    expect(first.find((x) => x.payment_id === "P-012")).toMatchObject({
      review_id: "RV-PAY-P-012",
      invoice_id: "INV-F",
      candidate_invoice_ids: ["INV-F"],
      status: "open",
    });
    const total = await db.exceptions.count();
    await recompute(db);
    await recompute(db);
    expect(await db.exceptions.count()).toBe(total);
    expect(await db.exceptions.where("kind").equals("unallocated_payment").toArray()).toEqual(first);
  });

  it("recompute() keeps a reviewer's decision on an existing item", async () => {
    await ensureSeeded(db, realFetcher());
    const item = (await db.exceptions.toArray())[0]!;
    await db.exceptions.update(item.review_id, { status: "dismissed" });
    await recompute(db);
    expect((await db.exceptions.get(item.review_id))?.status).toBe("dismissed");
  });

  it("R6: recompute() uses meta.asOf as today", async () => {
    await ensureSeeded(db, realFetcher());
    const before = (await db.priorities.get("INV-B"))?.days_overdue;
    await db.meta.put({ key: "asOf", value: "2026-11-09" });
    await recompute(db);
    expect((await db.priorities.get("INV-B"))?.days_overdue).toBe((before ?? 0) + 10);
  });

  it("TC-050: recomputing twice never duplicates a dispute raised from the same email", async () => {
    await ensureSeeded(db, realFetcher());
    const before = await db.disputes.toArray();
    await recompute(db);
    await recompute(db);
    const after = await db.disputes.toArray();
    expect(after.length).toBe(before.length);
    const bySource = new Map<string, number>();
    for (const d of after) {
      if (d.source_message_id) bySource.set(d.source_message_id, (bySource.get(d.source_message_id) ?? 0) + 1);
    }
    for (const count of bySource.values()) expect(count).toBe(1);
  });

  it("TC-051: a Manager resolving a dispute releases G4 and the invoice re-enters the queue", async () => {
    await ensureSeeded(db, realFetcher());
    expect(await db.priorities.get("INV-C")).toMatchObject({ gate: "G4", band: "disputed" });

    await db.meta.put({ key: "role", value: "manager" });
    await execute(db, {
      type: "dispute_transition",
      subject: { kind: "dispute", id: "D-E-011-1" },
      payload: { event: "start_review" },
    });
    await execute(db, {
      type: "resolve_dispute",
      subject: { kind: "dispute", id: "D-E-011-1" },
      payload: { outcome: "resolved" },
    });
    await recompute(db);

    const after = await db.priorities.get("INV-C");
    expect(after?.band).not.toBe("disputed");
    expect(after?.gate).not.toBe("G4");
  });
});

