/**
 * TASK-10.3 gate (TC-018, unit half): when the browser refuses IndexedDB,
 * `openDb()` falls back to an in-memory Dexie, reports `persistent:false`,
 * logs a `[verilane]`-prefixed `console.error`, and the store still works.
 */
import Dexie, { liveQuery } from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb, type VerilaneDb } from "./db";

let opened: VerilaneDb | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (opened) {
    const name = opened.name;
    opened.close();
    await Dexie.delete(name);
    opened = undefined;
  }
});

function silenceConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("openDb (SR9 storage fallback)", () => {
  it("is persistent when IndexedDB works", async () => {
    const result = await openDb("db-test-ok");
    opened = result.db;
    expect(result.persistent).toBe(true);
  });

  it("falls back to in-memory when indexedDB.open throws SecurityError", async () => {
    const errorSpy = silenceConsoleError();
    vi.spyOn(Dexie.dependencies.indexedDB, "open").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    const { db, persistent } = await openDb("db-test-security");

    expect(persistent).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith("[verilane] storage unavailable", expect.anything());
    // The fallback store is a working Dexie: write, then read back.
    await db.meta.put({ key: "probe", value: 42 });
    expect(await db.meta.get("probe")).toEqual({ key: "probe", value: 42 });
    db.close();
  });

  it("falls back when the IndexedDB API is missing entirely", async () => {
    silenceConsoleError();
    const original = Dexie.dependencies.indexedDB;
    const originalKeyRange = Dexie.dependencies.IDBKeyRange;
    Dexie.dependencies.indexedDB = null as unknown as IDBFactory;
    try {
      const { db, persistent } = await openDb("db-test-missing");
      expect(persistent).toBe(false);
      await db.meta.put({ key: "probe", value: 1 });
      expect(await db.meta.count()).toBe(1);
      db.close();
    } finally {
      Dexie.dependencies.indexedDB = original;
      Dexie.dependencies.IDBKeyRange = originalKeyRange;
    }
  });

  it("falls back when even reading globalThis.indexedDB throws", async () => {
    silenceConsoleError();
    const originalDeps = Dexie.dependencies.indexedDB;
    const originalKeyRange = Dexie.dependencies.IDBKeyRange;
    const originalGlobal = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Dexie.dependencies.indexedDB = null as unknown as IDBFactory;
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      const { db, persistent } = await openDb("db-test-throwing-global");
      expect(persistent).toBe(false);
      await db.meta.put({ key: "probe", value: 1 });
      expect(await db.meta.count()).toBe(1);
      // liveQuery (what the UI hooks use) must also run on the fallback.
      const live = await new Promise<number>((resolve, reject) => {
        const sub = liveQuery(() => db.meta.count()).subscribe({
          next: (v) => {
            sub.unsubscribe();
            resolve(v);
          },
          error: reject,
        });
        setTimeout(() => reject(new Error("liveQuery never emitted")), 1000);
      });
      expect(live).toBe(1);
      db.close();
    } finally {
      Dexie.dependencies.indexedDB = originalDeps;
      Dexie.dependencies.IDBKeyRange = originalKeyRange;
      if (originalGlobal) Object.defineProperty(globalThis, "indexedDB", originalGlobal);
    }
  });

  it("rethrows errors that aren't storage unavailability", async () => {
    vi.spyOn(Dexie.dependencies.indexedDB, "open").mockImplementation(() => {
      throw new TypeError("boom");
    });
    await expect(openDb("db-test-bug")).rejects.toThrow();
  });
});

/**
 * TASK-79.1 (TKT-75.01): the v1 → v2 upgrade. A browser that ran v1 holds
 * its review items in `reviewItems`; v2 copies them to `exceptions`, drops
 * `reviewItems`, and adds the empty `creditNotes` and `policyDecisions`.
 */
describe("Dexie v1 → v2 upgrade (TASK-79.1, TC-001)", () => {
  /** The shipped v1 schema, frozen here so the test opens a real v1 db. */
  const V1_STORES = {
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

  it("preserves every v1 row, moves reviewItems to exceptions and adds the new tables", async () => {
    const name = `db-test-upgrade-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(V1_STORES);
    await v1.open();
    // TC-001 data: 2 drafts, 1 dispute, 2 missing_info.
    const items = [
      { review_id: "RV-1", kind: "draft", status: "open", message_id: "M-1" },
      { review_id: "RV-2", kind: "draft", status: "actioned", message_id: "M-2" },
      { review_id: "RV-3", kind: "dispute", status: "open", message_id: "M-3" },
      { review_id: "RV-4", kind: "missing_info", status: "dismissed", message_id: "M-4" },
      { review_id: "RV-5", kind: "missing_info", status: "open", message_id: "M-5" },
    ];
    await v1.table("reviewItems").bulkAdd(items);
    await v1.table("payments").add({ payment_id: "P-1", invoice_id: "INV-1", paid_on: "2026-10-01", amount_paise: 100 });
    await v1.table("audit").add({ action: "add_note", subject: "invoice:INV-1" });
    await v1.table("meta").put({ key: "role", value: "manager" });
    v1.close();

    const { VerilaneDb } = await import("./db");
    const db = new VerilaneDb(name);
    opened = db;
    await db.open();

    expect(db.verno).toBe(2);
    const names = db.tables.map((t) => t.name);
    expect(names).not.toContain("reviewItems");
    expect(names).toEqual(expect.arrayContaining(["exceptions", "creditNotes", "policyDecisions"]));
    expect(await db.exceptions.orderBy("review_id").toArray()).toEqual(items);
    expect(await db.exceptions.where("status").equals("open").count()).toBe(3);
    expect(await db.payments.get("P-1")).toMatchObject({ invoice_id: "INV-1" });
    expect(await db.audit.count()).toBe(1);
    expect((await db.meta.get("role"))?.value).toBe("manager");
    expect(await db.creditNotes.count()).toBe(0);
    expect(await db.policyDecisions.count()).toBe(0);
    // The new tables carry their technical-plan §1.3/§1.4 indexes.
    expect(db.creditNotes.schema.primKey.name).toBe("credit_note_id");
    expect(db.creditNotes.schema.indexes.map((i) => i.name).sort()).toEqual(["created_at", "invoice_id"]);
    expect(db.policyDecisions.schema.primKey.name).toBe("decision_id");
    expect(db.policyDecisions.schema.indexes.map((i) => i.name).sort()).toEqual(["evaluated_at", "exception_id"]);
  });

  it("a fresh v2 db opens with the new tables empty", async () => {
    const { db } = await openDb(`db-test-fresh-v2-${Math.random()}`);
    opened = db;
    expect(db.verno).toBe(2);
    expect(await db.exceptions.count()).toBe(0);
    expect(await db.creditNotes.count()).toBe(0);
    expect(await db.policyDecisions.count()).toBe(0);
  });
});
