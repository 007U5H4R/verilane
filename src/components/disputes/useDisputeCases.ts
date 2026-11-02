"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { buildCases, type AuditLike, type DisputeCase } from "@/domain/disputes/listing";
import type { Match } from "@/domain/schema";
import type { AuditEventRow } from "@/store/db";
import { useAsOf, useDb } from "@/store/hooks";

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const obj = (v: unknown) =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

/** The stored audit row as the listing reads it: `subject` is "kind:id". */
export function toAuditLike(row: AuditEventRow): AuditLike {
  const cut = row.subject.indexOf(":");
  return {
    at: str(row.at) ?? "",
    action: row.action,
    subject_kind: cut < 0 ? row.subject : row.subject.slice(0, cut),
    subject_id: cut < 0 ? undefined : row.subject.slice(cut + 1),
    summary: str(row.summary),
    actor_label: str(row.actor_label),
    before: obj(row.before),
    after: obj(row.after),
  };
}

/**
 * Every dispute joined to its customer, invoice, email, extraction, match,
 * ledger payments and audit trail (TASK-38), live. `undefined` while loading.
 */
export function useDisputeCases(): DisputeCase[] | undefined {
  const db = useDb();
  const asOf = useAsOf();
  return useLiveQuery(async () => {
    const [disputes, customers, invoices, emails, extractions, matches, payments, audit] = await Promise.all([
      db.disputes.toArray(),
      db.customers.toArray(),
      db.invoices.toArray(),
      db.emails.toArray(),
      db.extractions.toArray(),
      db.matches.toArray(),
      db.payments.toArray(),
      db.audit.where("action").anyOf("assign_dispute", "dispute_transition", "resolve_dispute", "mark_disputed").toArray(),
    ]);
    return buildCases({
      disputes,
      customers,
      invoices,
      emails,
      extractions,
      matches: matches as unknown as Match[],
      payments,
      audit: audit.map(toAuditLike),
      asOf,
    });
  }, [db, asOf]);
}
