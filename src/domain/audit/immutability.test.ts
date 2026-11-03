/**
 * TASK-38 · The audit log is append-only. Three guards:
 * 1. Types: `audit` is not a `TableName`, so no command can `put` to it —
 *    `Tx.audit()` (append) is the only path.
 * 2. Behaviour: running commands only ever adds rows; every existing row is
 *    byte-for-byte unchanged afterwards.
 * 3. Source: nothing in `src/` updates, deletes or overwrites an audit row.
 *    The one documented exception is Settings → Reset demo data, which clears
 *    every table (audit included) and then records `demo_reset` as the first
 *    event of the fresh workspace (TC-060).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { TableName } from "@/domain/commands";
import type { Invoice } from "@/domain/schema";
import { VerilaneDb } from "@/store/db";
import { execute } from "@/store/tx";

describe("audit log immutability", () => {
  it("audit is not a writable table name", () => {
    // @ts-expect-error — `audit` must never be a TableName (no put path).
    const t: TableName = "audit";
    expect(t).toBe("audit");
  });

  let db: VerilaneDb;
  beforeEach(async () => {
    db = new VerilaneDb(`verilane-audit-immut-${Math.random()}`);
    await db.invoices.add({ row_id: 1, invoice_id: "INV-1", invoice_number: "1001" } as unknown as Invoice);
  });

  it("commands append exactly one event and never change earlier ones", async () => {
    const cmds = [
      { type: "add_note", subject: { kind: "invoice", id: "INV-1" }, payload: { text: "first" } },
      { type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "manager" } },
      { type: "add_note", subject: { kind: "invoice", id: "INV-1" }, payload: { text: "second" } },
      { type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "analyst" } },
    ] as const;
    let snapshot = await db.audit.orderBy("event_id").toArray();
    for (const cmd of cmds) {
      await execute(db, cmd);
      const now = await db.audit.orderBy("event_id").toArray();
      expect(now).toHaveLength(snapshot.length + 1);
      expect(now.slice(0, snapshot.length)).toEqual(snapshot);
      snapshot = now;
    }
    const ids = snapshot.map((r) => r.event_id);
    expect(ids).toEqual([...ids].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("a refused command leaves the log untouched", async () => {
    await execute(db, { type: "add_note", subject: { kind: "invoice", id: "INV-1" }, payload: { text: "x" } });
    const before = await db.audit.toArray();
    await expect(
      execute(db, { type: "add_note", subject: { kind: "invoice", id: "INV-NOPE" }, payload: { text: "x" } }),
    ).rejects.toThrow();
    expect(await db.audit.toArray()).toEqual(before);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__lint__" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("no code path edits or deletes audit rows", () => {
  it("never calls a mutating Dexie method on db.audit", () => {
    const offenders: string[] = [];
    const mutating = /\baudit\s*\.\s*(put|bulkPut|update|bulkUpdate|delete|bulkDelete|clear|modify)\s*\(/;
    const collection = /\baudit\s*\.\s*(where|filter|orderBy|toCollection)\b[^;]*\.\s*(modify|delete)\s*\(/;
    for (const f of sourceFiles(join(process.cwd(), "src"))) {
      const text = readFileSync(f, "utf8");
      if (mutating.test(text) || collection.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
