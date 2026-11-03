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
