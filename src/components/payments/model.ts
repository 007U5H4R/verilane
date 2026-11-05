import {
  assessCase,
  buildCases,
  duplicateReferences,
  kpis,
  type AssessedCase,
  type PaymentsKpis,
  type StoredException,
} from "@/domain/payments/reconcile";
import type { Customer } from "@/domain/schema";
import type { AuditEventRow } from "@/store/db";
import type { ReconciliationData } from "@/store/paymentsHooks";

/** Everything the Payments page shows, derived from data only (no I/O). */
export interface PaymentsModel {
  data: ReconciliationData;
  /** Every reconciliation case (one per email), assessed. */
  cases: AssessedCase[];
  /** Open uncertain-match items (one row per item). */
  unmatched: StoredException[];
  kpis: PaymentsKpis;
  /** Ledger entries a Manager verified a claim against. */
  verifiedIds: Set<string>;
  /** Ledger entries an open claim could be confirmed against. */
  candidateIds: Set<string>;
  /** UTR → case ids, for UTRs quoted by more than one email. */
  dupRefs: Map<string, string[]>;
  /** Audit events per review item id, newest first. */
  auditBy: Map<string, AuditEventRow[]>;
  /** Customers that appear on the page, by name. */
  customers: Customer[];
}

export function buildModel(data: ReconciliationData): PaymentsModel {
  const ctx = {
    invoices: data.invoices,
    customers: data.customers,
    emails: data.emails,
    extractions: data.extractions,
    matches: data.matches,
    payments: data.payments,
  };
  const cases = buildCases(data.items, data.matches, data.invoices).map((c) => assessCase(c, ctx));
  const verifiedIds = new Set<string>();
  for (const r of data.items) if (r.workflow_state === "verified" && r.verified_payment_id) verifiedIds.add(r.verified_payment_id);
  const candidateIds = new Set<string>();
  for (const c of cases) if (c.open) for (const k of c.candidates) if (k.linkable) candidateIds.add(k.payment.payment_id);
  const auditBy = new Map<string, AuditEventRow[]>();
  for (const e of data.audit) {
    const key = String(e.subject_id);
    const list = auditBy.get(key) ?? [];
    list.push(e);
    auditBy.set(key, list);
  }
  return {
    data,
    cases,
    unmatched: data.items.filter((r) => r.kind === "uncertain_match" && r.status === "open"),
    kpis: kpis(cases.map((c) => ({ id: c.case.id, open: c.open })), data.items, data.payments),
    verifiedIds,
    candidateIds,
    dupRefs: duplicateReferences(
      cases.map((c) => (c.claim.utr.provided ? { caseId: c.case.id, utr: c.claim.utr.value } : { caseId: c.case.id })),
    ),
    auditBy,
    customers: [...data.customers.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Audit events for every item of a case, newest first. */
export function caseAudit(model: PaymentsModel, itemIds: string[]): AuditEventRow[] {
  return itemIds
    .flatMap((id) => model.auditBy.get(id) ?? [])
    .sort((a, b) => (b.event_id ?? 0) - (a.event_id ?? 0));
}
