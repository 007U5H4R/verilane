/**
 * Data hook for the `/invoices` register (TASK-38). Kept out of `hooks.ts`
 * so the register owns its own join: every invoice (closed included) with
 * its stored priority, payments, customer and open disputes.
 */
"use client";
import { useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { buildRows, type InvoiceRow } from "@/domain/invoices/register";
import type { RankItem } from "@/domain/priority";
import { DbContext, useDb } from "./hooks";

export interface InvoiceRegister {
  rows: InvoiceRow[];
  /** Customers that appear on at least one invoice, by name — for the customer filter. */
  customers: { id: string; name: string | null }[];
}

/** `undefined` while loading; rows in ledger order (the view sorts). */
export function useInvoiceRegister(): InvoiceRegister | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const [invoices, priorities, payments, customers, openDisputes] = await Promise.all([
      db.invoices.toArray(),
      db.priorities.toArray(),
      db.payments.toArray(),
      db.customers.toArray(),
      db.disputes.where("status").noneOf(["resolved", "rejected"]).toArray(),
    ]);
    const priorityByInvoice = new Map(priorities.map((p) => [p.invoice_id, p]));
    const items: RankItem[] = [];
    for (const invoice of invoices) {
      const priority = priorityByInvoice.get(invoice.invoice_id);
      if (priority) items.push({ invoice, priority });
    }
    const customerById = new Map(customers.map((c) => [c.customer_id, c]));
    const rows = buildRows(items, customerById, payments, openDisputes);
    const ids = [...new Set(rows.map((r) => r.customerId))];
    const customerList = ids
      .map((id) => ({ id, name: customerById.get(id)?.name ?? null }))
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    return { rows, customers: customerList };
  }, [db]);
}

/** How many invoices are on the ledger, live — for the page subtitle.
 * Tolerates a missing db (the header renders in every state). */
export function useInvoiceCount(): number | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(async () => (db ? db.invoices.count() : undefined), [db]);
}
