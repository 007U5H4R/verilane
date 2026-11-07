/**
 * The Dexie schema (v1: technical-plan.md A3; v2: TASK-75 §1.5) and `openDb()`. Derived tables
 * (extractions, matches, priorities, evidence, dataIssues) are always
 * recomputed from source + workflow tables by `loader.recompute()` — never
 * written to directly by commands.
 */
import Dexie, { type DexieOptions, type Table, type Transaction } from "dexie";
import type {
  Customer,
  DataIssue,
  Dispute,
  Evidence,
  Extraction,
  Invoice,
  Payment,
  Priority,
} from "@/domain/schema";
import type { EmailMessage } from "@/domain/schema";

/** `emails` stores the raw ingested message alongside its own primary key. */
export type EmailRow = EmailMessage;

/** `dataIssues`' primary key is an autoincrement `id` (A3) — distinct from
 * the domain `DataIssue`'s own `issue_id` field. */
export type DataIssueRow = DataIssue & { id?: number };

/** `extractions` holds one provider output per message (TASK-12), keyed by `message_id`. */
export type EmailExtractionRow = Extraction;

// --- Tables with no domain type yet (TASK-8+) — minimal row shapes, kept
// loose until their owning ticket defines the real type. ------------------

export interface EmailMatchRow {
  message_id: string;
  /** Absent unless the outcome is `matched` (TASK-13); never null. */
  invoice_id?: string;
  [key: string]: unknown;
}

export type DisputeRow = Dispute;

export interface DraftRow {
  draft_id: string;
  invoice_id: string;
  status: string;
  [key: string]: unknown;
}

export interface ExceptionRow {
  review_id: string;
  kind: string;
  status: string;
  [key: string]: unknown;
}

/** `creditNotes` (TASK-75, technical-plan §1.3): empty until TKT-75.06 writes one. */
export interface CreditNoteRow {
  credit_note_id: string;
  invoice_id: string;
  created_at: string;
  [key: string]: unknown;
}

/**
 * `policyDecisions` (TASK-75, technical-plan §1.4; written by TKT-75.03's
 * `domain/policy.ts`). Append-only and versioned (R7): a row is `.add()`-ed,
 * never `.put()`/updated/deleted; re-evaluation appends a new row with the
 * same `exception_id` and a fresh `decision_id`.
 */
export interface PolicyDecisionRow {
  /** `POL-{exception_id}-{n}`, unique and stable once written. */
  decision_id: string;
  exception_id: string;
  evaluated_at: string;
  /** The rule table version this row was decided under (R7). */
  config_version?: string;
  gate_id?: string;
  verdict?: string;
  reason?: string;
  confidence?: string | null;
  amount_paise?: number;
  /** FS22: Recommend's own confidence disagreed with this verdict. */
  model_policy_conflict?: boolean;
  /** The inputs this verdict was decided on (`policyInputFingerprint`, EXE131):
   * a mismatch means the decision is stale and a new row must be appended. */
  input_fingerprint?: string;
  [key: string]: unknown;
}

/**
 * Transactions allowed to clear `policyDecisions` — only `reset_demo`'s
 * (`tx.ts` `resetToSeed`), which wipes the whole demo. Keyed by Dexie
 * transaction so the permission dies with it (TC-005, EXE131).
 */
const resettingTxs = new WeakSet<Transaction>();

/** Lets the current transaction (and its children) clear `policyDecisions`. */
export function allowPolicyDecisionReset(): void {
  const tx = Dexie.currentTransaction;
  if (!tx) throw new Error("allowPolicyDecisionReset() must run inside a transaction.");
  resettingTxs.add(tx);
}

function isResetting(tx: Transaction | undefined): boolean {
  for (let t: Transaction | undefined = tx; t; t = (t as Transaction & { parent?: Transaction }).parent) {
    if (resettingTxs.has(t)) return true;
  }
  return false;
}

const APPEND_ONLY = "policyDecisions is append-only (R7): re-evaluate by adding a new row.";

export interface AuditEventRow {
  event_id?: number;
  action: string;
  subject: string;
  [key: string]: unknown;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class VerilaneDb extends Dexie {
  customers!: Table<Customer, string>;
  invoices!: Table<Invoice, number>;
  payments!: Table<Payment, string>;
  emails!: Table<EmailRow, string>;
  extractions!: Table<EmailExtractionRow, string>;
  matches!: Table<EmailMatchRow, string>;
  priorities!: Table<Priority, string>;
  evidence!: Table<Evidence, string>;
  dataIssues!: Table<DataIssueRow, number>;
  disputes!: Table<DisputeRow, string>;
  drafts!: Table<DraftRow, string>;
  exceptions!: Table<ExceptionRow, string>;
  creditNotes!: Table<CreditNoteRow, string>;
  policyDecisions!: Table<PolicyDecisionRow, string>;
  audit!: Table<AuditEventRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(name: string, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
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
    });
    // v2 (TASK-79.1 / TKT-75.01): `reviewItems` becomes `exceptions` (same
    // key and indexes; rows copied, then the old table dropped), plus the
    // empty `creditNotes` and `policyDecisions` (technical-plan §1.3/§1.4).
    // Every other table is unchanged. Never edit a shipped version: add v3.
    this.version(2)
      .stores({
        exceptions: "review_id, kind, status",
        reviewItems: null,
        creditNotes: "credit_note_id, invoice_id, created_at",
        policyDecisions: "decision_id, exception_id, evaluated_at",
      })
      .upgrade(async (tx) => {
        const rows = await tx.table("reviewItems").toArray();
        await tx.table("exceptions").bulkAdd(rows);
      });
    // R7/TC-005: append-only enforced at the store, not by convention. A
    // `put()` over an existing key fires `updating`; `clear()` fires
    // `deleting` per row, hence the reset_demo-only bypass.
    this.policyDecisions.hook("updating", () => {
      throw new Error(APPEND_ONLY);
    });
    this.policyDecisions.hook("deleting", (_key, _obj, tx) => {
      if (!isResetting(tx)) throw new Error(APPEND_ONLY);
    });
  }
}

export interface OpenDbResult {
  db: VerilaneDb;
  persistent: boolean;
}

/** Dexie/DOM error names that mean "this browser won't give us IndexedDB"
 * (private mode, blocked storage, quota) — SR9 falls back instead of failing.
 * `MissingAPIError` is what Dexie throws when reading `window.indexedDB`
 * itself throws (it then sees no API at all). Anything else is a real bug
 * and propagates. */
const STORAGE_ERRORS = new Set([
  "OpenFailedError",
  "SecurityError",
  "QuotaExceededError",
  "MissingAPIError",
]);

function isStorageUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (STORAGE_ERRORS.has(err.name)) return true;
  const inner = (err as { inner?: unknown }).inner;
  return inner instanceof Error && STORAGE_ERRORS.has(inner.name);
}

/**
 * Where merely reading `globalThis.indexedDB` throws (blocked storage), two
 * Dexie internals break even for an in-memory db: `open()` compares its
 * factory with that global (a Safari 14 workaround) and throws, and
 * `liveQuery` silently never runs while `Dexie.dependencies.indexedDB` is
 * null (Dexie captured it as null at import). In that case only, point both
 * at the memory factory.
 */
function adoptMemoryFactoryIfGlobalUnusable(
  factory: IDBFactory,
  keyRange: typeof IDBKeyRange,
): void {
  try {
    // Reflect.get, not a bare `void` read — the minifier drops the latter.
    Reflect.get(globalThis, "indexedDB");
  } catch {
    Object.defineProperty(globalThis, "indexedDB", { value: factory, configurable: true });
  }
  if (!Dexie.dependencies.indexedDB) {
    Dexie.dependencies.indexedDB = factory;
    Dexie.dependencies.IDBKeyRange = keyRange;
  }
}

/**
 * Opens the `verilane` Dexie database. If the browser refuses IndexedDB
 * (SR9), falls back to an in-memory Dexie on `fake-indexeddb`'s memory
 * factory — same Dexie code path, nothing survives reload — and reports
 * `persistent:false` so the shell shows the storage banner.
 */
export async function openDb(name = "verilane"): Promise<OpenDbResult> {
  try {
    const db = new VerilaneDb(name);
    await db.open();
    return { db, persistent: true };
  } catch (err) {
    if (!isStorageUnavailable(err)) throw err;
    console.error("[verilane] storage unavailable", err);
    // Loaded only on the failure path, so the happy path never ships it.
    const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
    const indexedDB = new IDBFactory();
    adoptMemoryFactoryIfGlobalUnusable(indexedDB, IDBKeyRange);
    const db = new VerilaneDb(name, { indexedDB, IDBKeyRange });
    await db.open();
    return { db, persistent: false };
  }
}
