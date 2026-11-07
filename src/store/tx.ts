/**
 * `execute()` — the only way the UI mutates workflow state (TASK-14.4).
 * Runs the pure command core inside ONE Dexie read-write transaction, so the
 * state write and its audit event commit together or not at all.
 */
import { InvalidCommand, PermissionDenied } from "@/domain/commandConstants";
import type { ExecuteAgentInput, PolicyFacts, PolicyTx } from "@/domain/commands";
import type * as Policy from "@/domain/policy";
import type { Command, DataOps, Row, TableName, Tx } from "@/domain/commands";
import type { IngestResult } from "@/domain/ingest";
import { isRole, type Role } from "@/domain/permissions";
import type { Customer, DataIssue, Invoice, Match, Payment, Exception } from "@/domain/schema";
import { asOf } from "@/domain/clock";
import type { DraftSources } from "@/domain/validate";
import { allowPolicyDecisionReset, type AuditEventRow, type VerilaneDb } from "./db";
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
  exceptions: "review_id",
  payments: "payment_id",
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
    // TKT-75.06: the reversal names the allocation event it undoes.
    async latestAudit(subject, action) {
      return (await db.audit
        .where("subject")
        .equals(subject)
        .filter((e) => e.action === action)
        .last()) as unknown as (Row & { event_id: number }) | undefined;
    },
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
      allowPolicyDecisionReset(); // the one sanctioned clear of the append-only table (TC-005)
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
// allocate_payment writes a ledger row, then re-derives every table (EXE125).
// reverse_allocation is its inverse (TKT-75.06).
const WHOLE_DB: ReadonlySet<string> = new Set(["import_csv", "reset_demo", "set_as_of", "allocate_payment", "reverse_allocation"]);

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
        ...[db.invoices, db.drafts, db.disputes, db.exceptions, db.priorities, db.dataIssues, db.meta, db.audit],
        ...(DRAFT_COMMANDS.has(input.type) || LEDGER_COMMANDS.has(input.type) || RECONCILE_COMMANDS.has(input.type)
          ? DRAFT_READS(db)
          : []),
      ];
  // TASK-40: the command core and the loader's recompute load on first use,
  // not in every route's first load. Imported before the transaction opens: a
  // non-Dexie await inside it would let Dexie auto-commit early.
  const [{ run, AUDITED_REFUSALS, recordRefusal }, { recompute }] = await Promise.all([
    import("@/domain/commands"),
    import("./loader"),
  ]);
  // The role the command ran as, read once inside its transaction; the
  // refusal records this role, not a re-read one (m6).
  let actor: Role | undefined;
  try {
    return await db.transaction(
      "rw",
      scope,
      async () => {
        actor = await currentRole(db);
        const event = await run({ ...input, actor }, dexieTx(db, recompute));
        await opts.beforeCommit?.();
        return event;
      },
    );
  } catch (err) {
    // FS21 (EXE141): the refused command rolled back; its refusal is audited
    // in a transaction of its own, then the denial still reaches the caller.
    if (err instanceof PermissionDenied && AUDITED_REFUSALS.has(input.type) && actor !== undefined) {
      const deniedAs = actor;
      try {
        await db.transaction("rw", [db.invoices, db.drafts, db.disputes, db.exceptions, db.meta, db.audit], () =>
          recordRefusal({ ...input, actor: deniedAs }, err, dexieTx(db, recompute)),
        );
      } catch (auditErr) {
        // A failed refusal audit must not replace the denial (M1): log it,
        // keep it on the error, and still throw PermissionDenied.
        console.error(`Could not record permission_denied for ${input.type}:`, auditErr);
        err.cause = auditErr;
      }
    }
    throw err;
  }
}

/** Draft commands re-run the nine checks, so they also read the ledger (TASK-15). */
const DRAFT_COMMANDS: ReadonlySet<string> = new Set(["generate_draft", "edit_draft", "submit_draft", "approve_draft", "autopilot_send"]);
/** TASK-38: resolving as "payment reconciled" checks the ledger for a real payment. */
// CR-002: mark_disputed reads draftSources() to refuse a second open dispute.
const LEDGER_COMMANDS: ReadonlySet<string> = new Set(["resolve_dispute", "mark_disputed"]);
/** TASK-38: verify / propose-link read the ledger and matches (never write them). */
const RECONCILE_COMMANDS: ReadonlySet<string> = new Set(["reconcile_flag", "reconcile_decide"]);
const DRAFT_READS = (db: VerilaneDb) => [db.customers, db.payments, db.extractions, db.matches];

/** Everything the nine draft checks read, as of the persisted "today". */
export async function readDraftSources(db: VerilaneDb): Promise<DraftSources> {
  const stored = (await db.meta.get("asOf"))?.value;
  const [invoices, customers, payments, extractions, matches, disputes, exceptions] = await Promise.all([
    db.invoices.toArray(),
    db.customers.toArray(),
    db.payments.toArray(),
    db.extractions.toArray(),
    db.matches.toArray(),
    db.disputes.toArray(),
    db.exceptions.toArray(),
  ]);
  return {
    asOf: asOf({ asOf: typeof stored === "string" ? stored : undefined }),
    invoices,
    customers,
    payments,
    extractions,
    matches: matches as unknown as Match[],
    disputes,
    exceptions: exceptions as unknown as Exception[],
  };
}

// --- Execute agent + policy-gated submit (TKT-75.04, EXE180–EXE182) ---------

/** `dexieTx` plus the persisted policy facts Execute and the gated submit read. */
function dexiePolicyTx(db: VerilaneDb, recompute: typeof Recompute, policy: typeof Policy): PolicyTx {
  return {
    ...dexieTx(db, recompute),
    async policyFacts(exceptionId) {
      const [latest, history] = await Promise.all([
        policy.latestPolicyDecisionForException(db, exceptionId),
        db.audit.where("subject").equals(`review:${exceptionId}`).toArray(),
      ]);
      return { latest, history: history as unknown as PolicyFacts["history"] };
    },
  };
}

/**
 * Stage 3 (D75-1): runs the Execute agent for one exception in ONE rw
 * transaction over every table — the decision read, the staleness check and
 * the allocation commit together (EXE125's scope for allocate_payment).
 */
export async function executeAgent(db: VerilaneDb, input: ExecuteAgentInput, opts: ExecuteOptions = {}) {
  const [{ runExecuteAgent }, { recompute }, policy] = await Promise.all([
    import("@/domain/commands"),
    import("./loader"),
    import("@/domain/policy"),
  ]);
  return db.transaction("rw", db.tables, async () => {
    const outcome = await runExecuteAgent(input, dexiePolicyTx(db, recompute, policy));
    await opts.beforeCommit?.();
    return outcome;
  });
}

/**
 * The human "Submit for approval" on `/exceptions/[id]` (A1 matrix): the
 * allocation gated by the persisted verdict. A refusal rolls the command back,
 * then is audited in its own transaction (FS21) and rethrown.
 */
export async function submitAllocationGated(db: VerilaneDb, input: CommandInput, expectedFingerprint: string) {
  const [{ runPolicyGated, policyRefusalEvent }, { recompute }, policy] = await Promise.all([
    import("@/domain/commands"),
    import("./loader"),
    import("@/domain/policy"),
  ]);
  try {
    return await db.transaction("rw", db.tables, async () => {
      const actor = await currentRole(db);
      return runPolicyGated({ ...input, actor }, expectedFingerprint, dexiePolicyTx(db, recompute, policy));
    });
  } catch (e) {
    if (e instanceof PermissionDenied) {
      await db.transaction("rw", [db.audit, db.meta, db.policyDecisions], async () => {
        const actor = await currentRole(db);
        const latest = await policy.latestPolicyDecisionForException(db, input.subject.id);
        const event = policyRefusalEvent({ ...input, actor }, e.reason, new Date().toISOString(), latest?.decision_id);
        await db.audit.add(event as unknown as AuditEventRow);
      });
    }
    throw e;
  }
}
