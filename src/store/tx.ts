/**
 * `execute()` — the only way the UI mutates workflow state (TASK-14.4).
 * Runs the pure command core inside ONE Dexie read-write transaction, so the
 * state write and its audit event commit together or not at all.
 */
import { run, type Command, type Row, type TableName, type Tx } from "@/domain/commands";
import { isRole, type Role } from "@/domain/permissions";
import type { AuditEventRow, VerilaneDb } from "./db";

/** What callers pass: the actor is always the persisted role, never the caller's claim. */
export type CommandInput = Omit<Command, "actor"> & { actor?: Role };

export interface ExecuteOptions {
  /** Test-only: runs inside the transaction after the writes, before commit. */
  beforeCommit?: () => void | Promise<void>;
}

const KEY: Record<Exclude<TableName, "invoices">, string> = {
  drafts: "draft_id",
  disputes: "dispute_id",
  reviewItems: "review_id",
  meta: "key",
};

function dexieTx(db: VerilaneDb): Tx {
  return {
    async get(table, id) {
      if (table === "invoices") {
        return (await db.invoices
          .filter((i) => i.invoice_id === id)
          .first()) as Row | undefined;
      }
      return (await db.table(table).get(id)) as Row | undefined;
    },
    async put(table, row) {
      if (table === "invoices") {
        throw new Error("Source invoice rows are immutable.");
      }
      if (typeof row[KEY[table]] !== "string") {
        throw new Error(`Row for ${table} is missing ${KEY[table]}.`);
      }
      await db.table(table).put(row);
    },
    async audit(e) {
      await db.audit.add(e as unknown as AuditEventRow);
    },
    now: () => new Date().toISOString(),
  };
}

/** The persisted role (`meta.role`), defaulting to Analyst. */
export async function currentRole(db: VerilaneDb): Promise<Role> {
  const value = (await db.meta.get("role"))?.value;
  return isRole(value) ? value : "analyst";
}

export async function execute(
  db: VerilaneDb,
  input: CommandInput,
  opts: ExecuteOptions = {},
) {
  return db.transaction(
    "rw",
    [db.invoices, db.drafts, db.disputes, db.reviewItems, db.meta, db.audit],
    async () => {
      const actor = await currentRole(db);
      const event = await run({ ...input, actor }, dexieTx(db));
      await opts.beforeCommit?.();
      return event;
    },
  );
}
