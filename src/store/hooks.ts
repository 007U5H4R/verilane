/**
 * Client-side data hooks (TASK-7.6). `DbContext` is provided by
 * `DataProvider`; `useQueue()`/`useInvoice()` join the Dexie tables
 * `priority.ts`/`rank()` need, since neither lives on `Priority` alone.
 */
"use client";
import { createContext, useCallback, useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AS_OF_DATE } from "@/domain/clock";
import { AS_OF_KEY } from "@/domain/commandConstants";
import type { AuditEventInput } from "@/domain/commands";
import { can, type Action, type Permission, type Role, type Subject } from "@/domain/permissions";
import { approvalState } from "@/domain/draft";
import { rank, type RankItem } from "@/domain/priority";
import type { Customer, DataIssue, Dispute, EmailMessage, Extraction, Invoice, Match, Payment, Priority, ReviewItem } from "@/domain/schema";
import { DraftSchema, type Draft } from "@/domain/schema";
import type { AuditEventRow, VerilaneDb } from "./db";
import { currentRole, execute, type CommandInput } from "./tx";

export const DbContext = createContext<VerilaneDb | null>(null);

/** True when the stored seed is older than the served manifest (TC-014);
 * set by `DataProvider`, read by `SeedUpdatePrompt`. */
export const SeedUpdateContext = createContext(false);

export function useSeedUpdateAvailable(): boolean {
  return useContext(SeedUpdateContext);
}

/** `false` when `openDb()` fell back to in-memory storage (SR9, TASK-10). */
export const PersistentContext = createContext<boolean>(true);

export function usePersistentStorage(): boolean {
  return useContext(PersistentContext);
}

export function useDb(): VerilaneDb {
  const db = useContext(DbContext);
  if (!db) throw new Error("useDb() called outside <DataProvider>");
  return db;
}

/** The ranked queue (TC-006 order), live-updating as the underlying tables change. */
export function useQueue(): RankItem[] | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const [invoices, priorities, payments] = await Promise.all([
      db.invoices.toArray(),
      db.priorities.toArray(),
      db.payments.toArray(),
    ]);
    const priorityByInvoice = new Map(priorities.map((p) => [p.invoice_id, p]));
    const items: RankItem[] = [];
    for (const invoice of invoices) {
      const priority = priorityByInvoice.get(invoice.invoice_id);
      if (priority) items.push({ invoice, priority });
    }
    return rank(items, { payments });
  }, [db]);
}

/**
 * How many invoices the Queue ranks (one priority per invoice), live — for
 * the sidebar badge (TASK-9.5). Unlike the other hooks it tolerates a
 * missing db (the shell renders even when the database failed to open):
 * `undefined` while loading or without a db.
 */
export function useQueueCount(): number | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(async () => (db ? db.priorities.count() : undefined), [db]);
}

/** `customer_id → Customer`, for the Queue row's customer name (TASK-7.8). */
export function useCustomers(): Map<string, Customer> | undefined {
  const db = useDb();
  return useLiveQuery(
    () => db.customers.toArray().then((rows) => new Map(rows.map((c) => [c.customer_id, c]))),
    [db],
  );
}

/** All payments, for the Queue row's outstanding-amount column (TASK-7.8). */
export function usePayments(): Payment[] | undefined {
  const db = useDb();
  return useLiveQuery(() => db.payments.toArray(), [db]);
}

export interface InvoiceWithPriority {
  invoice: Invoice;
  priority: Priority;
  /** This invoice's ingest DataIssues — a duplicate number reads Conflict (R10). */
  dataIssues: DataIssue[];
}

/**
 * A single invoice + its priority, by `invoice_id`. `invoices` has no index
 * on `invoice_id` (A3: `row_id, &invoice_number, customer_id, status`), so
 * this filters rather than using Dexie's indexed `.where()`.
 */
export function useInvoice(invoiceId: string): InvoiceWithPriority | undefined | null {
  const db = useDb();
  return useLiveQuery(async () => {
    const invoice = await db.invoices
      .toCollection()
      .filter((i) => i.invoice_id === invoiceId)
      .first();
    if (!invoice) return null;
    const priority = await db.priorities.get(invoiceId);
    if (!priority) return null;
    const dataIssues = await db.dataIssues.where("record_id").equals(invoiceId).toArray();
    return { invoice, priority, dataIssues };
  }, [db, invoiceId]);
}

/**
 * The effective as-of date (`meta.asOf`, else `AS_OF_DATE`), live (TC-061).
 * Tolerates a missing db like `useQueueCount()`, so the shell can show it.
 */
export function useAsOf(): string {
  const db = useContext(DbContext);
  const stored = useLiveQuery(
    async () => (db ? (await db.meta.get(AS_OF_KEY))?.value : undefined),
    [db],
  );
  return typeof stored === "string" ? stored : AS_OF_DATE;
}

/** The persisted demo role (`meta.role`), live; Analyst until it loads. */
export function useRole(): Role {
  const db = useDb();
  return useLiveQuery(() => currentRole(db), [db]) ?? "analyst";
}

/**
 * Whether the current role may perform `action` on `subject` (TASK-14.5).
 * UI hint only — `execute()` re-checks against the stored row.
 */
export function useCan(action: Action, subject: Subject): Permission {
  return can(useRole(), action, subject);
}

/** `execute()` bound to the provided db. */
export function useExecute(): (cmd: CommandInput) => Promise<AuditEventInput> {
  const db = useDb();
  return useCallback((cmd: CommandInput) => execute(db, cmd), [db]);
}

/** Every audit event, newest first (event ids are monotonic). */
export function useAudit(): AuditEventRow[] | undefined {
  const db = useDb();
  return useLiveQuery(() => db.audit.orderBy("event_id").reverse().toArray(), [db]);
}

/** Audit events about one invoice, newest first (Activity log). */
export function useInvoiceActivity(invoiceId: string): AuditEventRow[] | undefined {
  const db = useDb();
  return useLiveQuery(
    () =>
      db.audit
        .orderBy("event_id")
        .reverse()
        .filter((e) => e.invoice_id === invoiceId || e.subject === `invoice:${invoiceId}`)
        .toArray(),
    [db, invoiceId],
  );
}

export interface InvoiceMessage {
  email: EmailMessage;
  extraction: Extraction;
}

/**
 * Messages whose extraction cites this invoice's `invoice_number`, oldest
 * first (TASK-12.6). An invoice with no number can't be cited, so it has no
 * communication (FS9 empty state).
 */
export function useInvoiceCommunication(invoiceId: string): InvoiceMessage[] | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const invoice = await db.invoices
      .toCollection()
      .filter((i) => i.invoice_id === invoiceId)
      .first();
    const number = invoice?.invoice_number;
    if (!number) return [];
    const extractions = await db.extractions
      .filter((x) => x.invoice_refs.includes(number))
      .toArray();
    const emails = await db.emails.bulkGet(extractions.map((x) => x.message_id));
    const out: InvoiceMessage[] = [];
    extractions.forEach((extraction, i) => {
      const email = emails[i];
      if (email) out.push({ email, extraction });
    });
    return out.sort((a, b) => a.email.sent_at.localeCompare(b.email.sent_at));
  }, [db, invoiceId]);
}

export interface PaymentsData {
  payments: Payment[];
  invoices: Map<string, Invoice>;
  customers: Map<string, Customer>;
  emails: Map<string, EmailMessage>;
  matches: Map<string, Match>;
  /** Open uncertain-match and reconciliation items, by email then id. */
  reviewItems: ReviewItem[];
}

const PAYMENT_REVIEW_KINDS = new Set(["uncertain_match", "reconciliation"]);

/**
 * Everything the Payments page shows (TASK-13.4): the ledger, plus the open
 * review items the matcher raised, with the emails and matches they cite.
 */
export function usePaymentsData(): PaymentsData | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const [payments, invoices, customers, emails, matches, items] = await Promise.all([
      db.payments.toArray(),
      db.invoices.toArray(),
      db.customers.toArray(),
      db.emails.toArray(),
      db.matches.toArray(),
      db.reviewItems.toArray(),
    ]);
    const reviewItems = (items as ReviewItem[])
      .filter((r) => r.status === "open" && PAYMENT_REVIEW_KINDS.has(r.kind))
      .sort((a, b) => a.message_id.localeCompare(b.message_id) || a.review_id.localeCompare(b.review_id));
    return {
      payments: [...payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
      invoices: new Map(invoices.map((i) => [i.invoice_id, i])),
      customers: new Map(customers.map((c) => [c.customer_id, c])),
      emails: new Map(emails.map((e) => [e.message_id, e])),
      matches: new Map((matches as Match[]).map((m) => [m.message_id, m])),
      reviewItems,
    };
  }, [db]);
}

/** The draft id's per-invoice sequence number (`DR-<invoice>-<n>`); 0 if absent. */
function draftSeq(id: string): number {
  const n = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isInteger(n) ? n : 0;
}

/**
 * The invoice's current reminder draft (TASK-15.5): the newest one not
 * rejected, or `null` when there is none. Rows that fail `DraftSchema`
 * (e.g. hand-made test fixtures) are ignored. `undefined` while loading.
 */
export function useInvoiceDraft(invoiceId: string): Draft | null | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const rows = await db.drafts.where("invoice_id").equals(invoiceId).toArray();
    const drafts: Draft[] = [];
    for (const row of rows) {
      const parsed = DraftSchema.safeParse(row);
      if (parsed.success && parsed.data.status !== "rejected") drafts.push(parsed.data);
    }
    drafts.sort((a, b) => draftSeq(b.draft_id) - draftSeq(a.draft_id));
    return drafts[0] ?? null;
  }, [db, invoiceId]);
}

/**
 * How many disputes are still open (not resolved/rejected), live — for the
 * sidebar badge (TASK-17.3). Tolerates a missing db like `useQueueCount()`.
 */
export function useDisputeCount(): number | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(
    async () => (db ? db.disputes.where("status").noneOf(["resolved", "rejected"]).count() : undefined),
    [db],
  );
}

export interface DisputeWithContext {
  dispute: Dispute;
  customer?: Customer;
  invoice?: Invoice;
  email?: EmailMessage;
}

/** Every dispute with its customer, invoice and source-email context, for the `/disputes` list (TASK-17.3). */
export function useDisputes(): DisputeWithContext[] | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const [disputes, customers, invoices, emails] = await Promise.all([
      db.disputes.toArray(),
      db.customers.toArray(),
      db.invoices.toArray(),
      db.emails.toArray(),
    ]);
    const customerById = new Map(customers.map((c) => [c.customer_id, c]));
    const invoiceById = new Map(invoices.map((i) => [i.invoice_id, i]));
    const emailById = new Map(emails.map((e) => [e.message_id, e]));
    return disputes
      .map((dispute) => ({
        dispute,
        customer: customerById.get(dispute.customer_id),
        invoice: dispute.invoice_id !== undefined ? invoiceById.get(dispute.invoice_id) : undefined,
        email: dispute.source_message_id !== undefined ? emailById.get(dispute.source_message_id) : undefined,
      }))
      .sort((a, b) => a.dispute.dispute_id.localeCompare(b.dispute.dispute_id));
  }, [db]);
}

/** One dispute with its context, by `dispute_id`, for `/disputes/[id]` (TASK-17.3). */
export function useDispute(disputeId: string): DisputeWithContext | undefined | null {
  const db = useDb();
  return useLiveQuery(async () => {
    const dispute = await db.disputes.get(disputeId);
    if (!dispute) return null;
    const [customer, invoice, email] = await Promise.all([
      db.customers.get(dispute.customer_id),
      dispute.invoice_id !== undefined
        ? db.invoices.toCollection().filter((i) => i.invoice_id === dispute.invoice_id).first()
        : undefined,
      dispute.source_message_id !== undefined ? db.emails.get(dispute.source_message_id) : undefined,
    ]);
    return { dispute, customer, invoice, email };
  }, [db, disputeId]);
}

/**
 * How many drafts are awaiting approval, live — for the sidebar badge
 * (TASK-16.5). A `validated` draft with failed checks is blocked, not
 * awaiting (T16-4), so it is not counted. Tolerates a missing db like
 * `useQueueCount()`; `undefined` while loading.
 */
export function useDraftCount(): number | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(
    async () =>
      db
        ? db.drafts
            .where("status")
            .equals("validated")
            .filter((d) => approvalState(d) === "awaiting")
            .count()
        : undefined,
    [db],
  );
}

export interface DraftAwaitingApproval {
  draft: Draft;
  customer?: Customer;
  invoice?: Invoice;
}

/** `validated` drafts in one approval state, with invoice/customer context, sorted by id. */
async function validatedDrafts(db: VerilaneDb, state: "awaiting" | "blocked"): Promise<DraftAwaitingApproval[]> {
  const [rows, customers, invoices] = await Promise.all([
    db.drafts
      .where("status")
      .equals("validated")
      .filter((d) => approvalState(d) === state)
      .toArray(),
    db.customers.toArray(),
    db.invoices.toArray(),
  ]);
  const customerById = new Map(customers.map((c) => [c.customer_id, c]));
  const invoiceById = new Map(invoices.map((i) => [i.invoice_id, i]));
  const drafts: Draft[] = [];
  for (const row of rows) {
    const parsed = DraftSchema.safeParse(row);
    if (parsed.success) drafts.push(parsed.data);
  }
  return drafts
    .map((draft) => ({
      draft,
      customer: customerById.get(draft.customer_id),
      invoice: invoiceById.get(draft.invoice_id),
    }))
    .sort((a, b) => a.draft.draft_id.localeCompare(b.draft.draft_id));
}

/** Every draft awaiting approval (validated, no failed checks), for `/drafts` (TASK-16.5, T16-4). */
export function useDraftsAwaitingApproval(): DraftAwaitingApproval[] | undefined {
  const db = useDb();
  return useLiveQuery(() => validatedDrafts(db, "awaiting"), [db]);
}

/** Validated drafts whose last validation left failed checks — "Blocked — checks failed" on `/drafts` (T16-4). */
export function useBlockedDrafts(): DraftAwaitingApproval[] | undefined {
  const db = useDb();
  return useLiveQuery(() => validatedDrafts(db, "blocked"), [db]);
}

/**
 * Whether the invoice has a dispute that is still open (not resolved or
 * rejected), live — blocks Approve in the Investigation action bar (TASK-16).
 */
export function useHasOpenDispute(invoiceId: string): boolean | undefined {
  const db = useDb();
  return useLiveQuery(
    async () =>
      (await db.disputes
        .where("invoice_id")
        .equals(invoiceId)
        .filter((d) => d.status !== "resolved" && d.status !== "rejected")
        .count()) > 0,
    [db, invoiceId],
  );
}
