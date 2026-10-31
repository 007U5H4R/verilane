/**
 * The Dexie v1 schema (technical-plan.md A3) and `openDb()`. Derived tables
 * (extractions, matches, priorities, evidence, dataIssues) are always
 * recomputed from source + workflow tables by `loader.recompute()` — never
 * written to directly by commands.
 */
import Dexie, { type DexieOptions, type Table } from "dexie";
import type {
  Customer,
  DataIssue,
  Evidence,
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

// --- Tables with no domain type yet (TASK-8+) — minimal row shapes, kept
// loose until their owning ticket defines the real type. ------------------

export interface EmailExtractionRow {
  message_id: string;
  [key: string]: unknown;
}

export interface EmailMatchRow {
  message_id: string;
  invoice_id: string;
  [key: string]: unknown;
}

export interface DisputeRow {
  dispute_id: string;
  invoice_id: string;
  status: string;
  [key: string]: unknown;
}

export interface DraftRow {
  draft_id: string;
  invoice_id: string;
  status: string;
  [key: string]: unknown;
}

export interface ReviewItemRow {
  review_id: string;
  kind: string;
  status: string;
  [key: string]: unknown;
}

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
  reviewItems!: Table<ReviewItemRow, string>;
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
