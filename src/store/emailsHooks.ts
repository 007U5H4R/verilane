/**
 * TASK-38 · Email Conversations: the ingested messages grouped into threads
 * and joined to the pipeline rows stored about them. Read-only.
 */
"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { buildThreads, type EmailThread } from "@/domain/emails/threads";
import type { Customer, Invoice, Match, Exception } from "@/domain/schema";
import { useDb } from "./hooks";

export interface EmailThreadsData {
  /** Newest conversation first. */
  threads: EmailThread[];
  invoices: Invoice[];
  /** Customers that appear on at least one thread, by name. */
  customers: Customer[];
}

/** `undefined` while loading; live-updates as any joined table changes. */
export function useEmailThreads(): EmailThreadsData | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const [emails, extractions, matches, exceptions, disputes, customers, invoices] = await Promise.all([
      db.emails.toArray(),
      db.extractions.toArray(),
      db.matches.toArray(),
      db.exceptions.toArray(),
      db.disputes.toArray(),
      db.customers.toArray(),
      db.invoices.toArray(),
    ]);
    // The matches / exceptions tables are typed loosely in db.ts; the rows are
    // the domain shapes (same cast as usePaymentsData in hooks.ts).
    const threads = buildThreads({
      emails,
      extractions,
      matches: matches as Match[],
      exceptions: exceptions as Exception[],
      disputes,
      customers,
      invoices,
    });
    const onThreads = new Set(threads.flatMap((t) => (t.customer_id ? [t.customer_id] : [])));
    return {
      threads,
      invoices,
      customers: customers.filter((c) => onThreads.has(c.customer_id)).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [db]);
}
