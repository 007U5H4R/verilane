/**
 * `execute()` — the only way the UI mutates workflow state (TASK-14.4).
 * Runs the pure command core inside ONE Dexie read-write transaction, so the
 * state write and its audit event commit together or not at all.
 */
import { InvalidCommand } from "@/domain/commandConstants";
import type { Command, DataOps, Row, TableName, Tx } from "@/domain/commands";
import type { IngestResult } from "@/domain/ingest";
import { isRole, type Role } from "@/domain/permissions";
import type { Customer, DataIssue, Invoice, Match, Payment, ReviewItem } from "@/domain/schema";
import { asOf } from "@/domain/clock";
import type { DraftSources } from "@/domain/validate";
import type { AuditEventRow, VerilaneDb } from "./db";
import type { recompute as Recompute } from "./loader";
import { SEED_VERSION_KEY } from "./seedVersion";

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

function dexieTx(db: VerilaneDb, recompute: typeof Recompute): Tx {
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
    data: dexieDataOps(db, recompute),
    draftSources: () => readDraftSources(db),
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
function dexieDataOps(db: VerilaneDb, recompute: typeof Recompute): DataOps {
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
    : [
        // priorities + dataIssues: derived tables a command may touch (R11).
        ...[db.invoices, db.drafts, db.disputes, db.reviewItems, db.priorities, db.dataIssues, db.meta, db.audit],
        ...(DRAFT_COMMANDS.has(input.type) || LEDGER_COMMANDS.has(input.type) || RECONCILE_COMMANDS.has(input.type)
          ? DRAFT_READS(db)
          : []),
      ];
  // TASK-40: the command core and the loader's recompute load on first use,
  // not in every route's first load. Imported before the transaction opens: a
  // non-Dexie await inside it would let Dexie auto-commit early.
  const [{ run }, { recompute }] = await Promise.all([import("@/domain/commands"), import("./loader")]);
  return db.transaction(
    "rw",
    scope,
    async () => {
      const actor = await currentRole(db);
      const event = await run({ ...input, actor }, dexieTx(db, recompute));
      await opts.beforeCommit?.();
      return event;
    },
  );
}

/** Draft commands re-run the nine checks, so they also read the ledger (TASK-15). */
const DRAFT_COMMANDS: ReadonlySet<string> = new Set(["generate_draft", "edit_draft", "submit_draft", "approve_draft"]);
/** TASK-38: resolving as "payment reconciled" checks the ledger for a real payment. */
const LEDGER_COMMANDS: ReadonlySet<string> = new Set(["resolve_dispute"]);
/** TASK-38: verify / propose-link read the ledger and matches (never write them). */
const RECONCILE_COMMANDS: ReadonlySet<string> = new Set(["reconcile_flag", "reconcile_decide"]);
const DRAFT_READS = (db: VerilaneDb) => [db.customers, db.payments, db.extractions, db.matches];

/** Everything the nine draft checks read, as of the persisted "today". */
export async function readDraftSources(db: VerilaneDb): Promise<DraftSources> {
  const stored = (await db.meta.get("asOf"))?.value;
  const [invoices, customers, payments, extractions, matches, disputes, reviewItems] = await Promise.all([
    db.invoices.toArray(),
    db.customers.toArray(),
    db.payments.toArray(),
    db.extractions.toArray(),
    db.matches.toArray(),
    db.disputes.toArray(),
    db.reviewItems.toArray(),
  ]);
  return {
    asOf: asOf({ asOf: typeof stored === "string" ? stored : undefined }),
    invoices,
    customers,
    payments,
    extractions,
    matches: matches as unknown as Match[],
    disputes,
    reviewItems: reviewItems as unknown as ReviewItem[],
  };
}
