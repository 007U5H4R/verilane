/**
 * Client-side data hooks (TASK-7.6). `DbContext` is provided by
 * `DataProvider`; `useQueue()`/`useInvoice()` join the Dexie tables
 * `priority.ts`/`rank()` need, since neither lives on `Priority` alone.
 */
"use client";
import { createContext, useCallback, useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AuditEventInput } from "@/domain/commands";
import { can, type Action, type Permission, type Role, type Subject } from "@/domain/permissions";
import { rank, type RankItem } from "@/domain/priority";
import type { Customer, EmailMessage, Extraction, Invoice, Payment, Priority } from "@/domain/schema";
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
    return { invoice, priority };
  }, [db, invoiceId]);
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
