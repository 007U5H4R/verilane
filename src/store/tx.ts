/**
 * `execute()` — the only way the UI mutates workflow state (TASK-14.4).
 * Runs the pure command core inside ONE Dexie read-write transaction, so the
 * state write and its audit event commit together or not at all.
 */
import {
  InvalidCommand,
  run,
  type Command,
  type DataOps,
  type Row,
  type TableName,
  type Tx,
} from "@/domain/commands";
import type { IngestResult } from "@/domain/ingest";
import { isRole, type Role } from "@/domain/permissions";
import type { Customer, DataIssue, Invoice, Payment } from "@/domain/schema";
import type { AuditEventRow, VerilaneDb } from "./db";
import { recompute, SEED_VERSION_KEY } from "./loader";

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
    data: dexieDataOps(db),
  };
}

function isIngestResult(v: unknown): v is IngestResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return ["customers", "invoices", "payments", "emails", "dataIssues"].every((k) =>
    Array.isArray(r[k]),
  );
}

/**
 * The bulk writes behind import_csv / reset_demo / set_as_of (TASK-19).
 * They run inside `execute()`'s transaction, whose scope is every table for
 * these commands, so the nested `recompute()` joins it.
 */
function dexieDataOps(db: VerilaneDb): DataOps {
  return {
    async replaceSource(kind, rows, dataIssues) {
      if (kind === "invoices") {
        await db.invoices.clear();
        await db.invoices.bulkAdd(rows as unknown as Invoice[]);
        // Data issues are raised for invoices only, so they go with them.
        await db.dataIssues.clear();
        await db.dataIssues.bulkAdd(dataIssues as unknown as DataIssue[]);
      } else if (kind === "customers") {
        await db.customers.clear();
        await db.customers.bulkAdd(rows as unknown as Customer[]);
      } else {
        await db.payments.clear();
        await db.payments.bulkAdd(rows as unknown as Payment[]);
      }
      await recompute(db);
    },
    async resetToSeed(seed, seedVersion) {
      if (!isIngestResult(seed)) throw new InvalidCommand("Reset needs the demo seed.");
      // The role is a viewer preference, not demo data: it survives a reset.
      const role = await db.meta.get("role");
      await Promise.all(db.tables.map((t) => t.clear()));
      if (role) await db.meta.put(role);
      await db.customers.bulkAdd(seed.customers);
      await db.invoices.bulkAdd(seed.invoices);
      await db.payments.bulkAdd(seed.payments);
      await db.emails.bulkAdd(seed.emails);
      await db.dataIssues.bulkAdd(seed.dataIssues);
      await db.meta.put({ key: SEED_VERSION_KEY, value: seedVersion });
      await recompute(db);
      return {
        customers: seed.customers.length,
        invoices: seed.invoices.length,
        payments: seed.payments.length,
        emails: seed.emails.length,
      };
    },
    recompute: () => recompute(db),
  };
}

/** Commands that rewrite source or derived tables need every table in scope. */
const WHOLE_DB: ReadonlySet<string> = new Set(["import_csv", "reset_demo", "set_as_of"]);

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
  const scope = WHOLE_DB.has(input.type)
    ? db.tables
    : [db.invoices, db.drafts, db.disputes, db.reviewItems, db.meta, db.audit];
  return db.transaction(
    "rw",
    scope,
    async () => {
      const actor = await currentRole(db);
      const event = await run({ ...input, actor }, dexieTx(db));
      await opts.beforeCommit?.();
      return event;
    },
  );
}
