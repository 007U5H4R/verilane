/**
 * Payments & Reconciliation data (TASK-38). Like `usePaymentsData()`, plus
 * what the reconciliation workflow needs: every payment review item (open or
 * closed, with its workflow fields), the extractions, and the audit events
 * about those items. Read only.
 */
"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { workflowOf, type StoredException } from "@/domain/payments/reconcile";
import { isEmailException, type Customer, type EmailException, type EmailMessage, type Extraction, type Invoice, type Match, type Payment, type Exception } from "@/domain/schema";
import type { AuditEventRow } from "./db";
import { useDb } from "./hooks";

export interface ReconciliationData {
  /** The ledger, newest first. */
  payments: Payment[];
  invoices: Map<string, Invoice>;
  customers: Map<string, Customer>;
  emails: Map<string, EmailMessage>;
  matches: Map<string, Match>;
  extractions: Map<string, Extraction>;
  /** Every reconciliation / uncertain-match item, open or closed. */
  items: StoredException[];
  /** Audit events about those items, newest first. */
  audit: AuditEventRow[];
}

const KINDS = new Set(["uncertain_match", "reconciliation"]);

export function useReconciliationData(): ReconciliationData | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const [payments, invoices, customers, emails, matches, extractions, rows, audit] = await Promise.all([
      db.payments.toArray(),
      db.invoices.toArray(),
      db.customers.toArray(),
      db.emails.toArray(),
      db.matches.toArray(),
      db.extractions.toArray(),
      db.exceptions.toArray(),
      db.audit.toArray(),
    ]);
    const items: StoredException[] = (rows as Exception[])
      .filter((r): r is EmailException => KINDS.has(r.kind) && isEmailException(r))
      .map((r) => ({ ...r, ...workflowOf(r as unknown as Record<string, unknown>) }))
      .sort((a, b) => a.message_id.localeCompare(b.message_id) || a.review_id.localeCompare(b.review_id));
    const ids = new Set(items.map((r) => r.review_id));
    return {
      payments: [...payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on) || a.payment_id.localeCompare(b.payment_id)),
      invoices: new Map(invoices.map((i) => [i.invoice_id, i])),
      customers: new Map(customers.map((c) => [c.customer_id, c])),
      emails: new Map(emails.map((e) => [e.message_id, e])),
      matches: new Map((matches as Match[]).map((m) => [m.message_id, m])),
      extractions: new Map((extractions as Extraction[]).map((x) => [x.message_id, x])),
      items,
      audit: (audit as AuditEventRow[])
        .filter((e) => ids.has(String(e.subject_id)))
        .sort((a, b) => (b.event_id ?? 0) - (a.event_id ?? 0)),
    };
  }, [db]);
}
