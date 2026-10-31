/**
 * Client-side data hooks (TASK-7.6). `DbContext` is provided by
 * `DataProvider`; `useQueue()`/`useInvoice()` join the Dexie tables
 * `priority.ts`/`rank()` need, since neither lives on `Priority` alone.
 */
"use client";
import { createContext, useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { rank, type RankItem } from "@/domain/priority";
import type { Customer, Invoice, Payment, Priority } from "@/domain/schema";
import type { VerilaneDb } from "./db";

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
