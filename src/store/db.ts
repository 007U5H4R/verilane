/**
 * The Dexie v1 schema (technical-plan.md A3) and `openDb()`. Derived tables
 * (extractions, matches, priorities, evidence, dataIssues) are always
 * recomputed from source + workflow tables by `loader.recompute()` — never
 * written to directly by commands.
 */
import Dexie, { type Table } from "dexie";
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

  constructor(name: string) {
    super(name);
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

/**
 * Opens the `verilane` Dexie database. SR9's full in-memory fallback (on
 * `OpenFailedError`/`SecurityError`/`QuotaExceededError`, swap to an
 * in-memory Dexie-compatible store and surface the storage banner) is
 * TASK-10's job; this just establishes the `{db, persistent}` shape its
 * caller depends on.
 */
export async function openDb(name = "verilane"): Promise<OpenDbResult> {
  const db = new VerilaneDb(name);
  await db.open();
  return { db, persistent: true };
}
