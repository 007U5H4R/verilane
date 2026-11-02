/**
 * Disputes page listing (TASK-38). Pure: joins the stored rows into one
 * case per dispute, then filters, sorts and pages them. Every figure comes
 * from a stored row; nothing is estimated.
 */
import type {
  Customer,
  Dispute,
  DisputeStatus,
  DisputeType,
  EmailMessage,
  Extraction,
  Invoice,
  Match,
  Payment,
} from "../schema";
import {
  ageDays,
  DISPUTE_GROUP,
  isOpen,
  matchesAge,
  matchesStatus,
  type AgeFilter,
  type DisputeGroup,
  type StatusFilter,
} from "./model";

/** The audit fields the listing reads (a structural subset of the stored event). */
export interface AuditLike {
  at: string;
  action: string;
  subject_kind?: string;
  subject_id?: string;
  summary?: string;
  actor_label?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface DisputeSources {
  disputes: Dispute[];
  customers: Customer[];
  invoices: Invoice[];
  emails: EmailMessage[];
  extractions: Extraction[];
  matches: Match[];
  payments: Payment[];
  audit: AuditLike[];
  asOf: string;
}

export interface DisputeCase {
  dispute: Dispute;
  group: DisputeGroup;
  open: boolean;
  customerName: string;
  invoice?: Invoice;
  /** What the row shows as the invoice reference: the number, else the id. */
  invoiceLabel: string;
  email?: EmailMessage;
  extraction?: Extraction;
  match?: Match;
  /** Every invoice the claim names (a duplicate claim names a pair). */
  invoiceIds: string[];
  /**
   * Invoice value on hold (paise), or null when it must not be shown as a
   * verified amount: a payment-claim dispute, or no ledger invoice.
   */
  amountPaise: number | null;
  /** Why the amount is withheld, when it is. */
  amountNote?: string;
  /** The customer says they already paid (an unverified claim). */
  paymentClaimed: boolean;
  /** Ledger payments recorded against the disputed invoice(s). */
  ledgerPayments: Payment[];
  createdAt?: string;
  age: number | null;
  /** Audit events about this dispute, oldest first. */
  events: AuditLike[];
}

const lc = (s: string) => s.toLowerCase();

/** True when the dispute is a payment claim; such amounts are never verified. */
export function isPaymentClaim(d: Pick<Dispute, "type">, x?: Pick<Extraction, "payment_claim">): boolean {
  return d.type === "payment_already_completed" || (x?.payment_claim ?? null) !== null;
}

/** When the dispute was raised: its source email, else its manual-open audit event. */
export function createdAtFor(dispute: Dispute, email: EmailMessage | undefined, audit: AuditLike[]): string | undefined {
  if (email) return email.sent_at;
  const opened = audit.find(
    (e) => e.action === "mark_disputed" && e.after !== undefined && e.after.dispute_id === dispute.dispute_id,
  );
  return opened?.at;
}

export function buildCases(src: DisputeSources): DisputeCase[] {
  const customers = new Map(src.customers.map((c) => [c.customer_id, c]));
  const invoices = new Map(src.invoices.map((i) => [i.invoice_id, i]));
  const emails = new Map(src.emails.map((e) => [e.message_id, e]));
  const extractions = new Map(src.extractions.map((x) => [x.message_id, x]));
  const matches = new Map(src.matches.map((m) => [m.message_id, m]));

  return src.disputes.map((d) => {
    const msg = d.source_message_id;
    const email = msg ? emails.get(msg) : undefined;
    const extraction = msg ? extractions.get(msg) : undefined;
    const match = msg ? matches.get(msg) : undefined;
    const invoice = d.invoice_id ? invoices.get(d.invoice_id) : undefined;
    const invoiceIds = [
      ...new Set([
        ...(d.invoice_id ? [d.invoice_id] : []),
        ...(d.type === "duplicate_invoice" && match ? match.candidates : []),
      ]),
    ];
    const paymentClaimed = isPaymentClaim(d, extraction);
    let amountPaise: number | null = null;
    let amountNote: string | undefined;
    if (paymentClaimed) {
      amountNote = "The customer says this is paid; that claim is not verified, so no amount is counted.";
    } else if (!invoice) {
      amountNote = "No ledger invoice is linked to this dispute.";
    } else {
      amountPaise = invoice.amount_paise;
    }
    const createdAt = createdAtFor(d, email, src.audit);
    const events = src.audit
      .filter((e) => e.subject_kind === "dispute" && e.subject_id === d.dispute_id)
      .concat(
        src.audit.filter(
          (e) => e.action === "mark_disputed" && e.after !== undefined && e.after.dispute_id === d.dispute_id,
        ),
      )
      .sort((a, b) => a.at.localeCompare(b.at));
    return {
      dispute: d,
      group: DISPUTE_GROUP[d.status],
      open: isOpen(d.status),
      customerName: customers.get(d.customer_id)?.name ?? d.customer_id,
      invoice,
      invoiceLabel: invoice?.invoice_number ?? d.invoice_id ?? "No invoice",
      email,
      extraction,
      match,
      invoiceIds,
      amountPaise,
      amountNote,
      paymentClaimed,
      ledgerPayments: src.payments.filter((p) => invoiceIds.includes(p.invoice_id)),
      createdAt,
      age: ageDays(createdAt, src.asOf),
      events,
    };
  });
}

// --- KPIs -------------------------------------------------------------------

export interface DisputeKpis {
  /** Open disputes (not resolved or rejected). */
  total: number;
  needsResponse: number;
  awaitingCustomer: number;
  inResolution: number;
  closed: number;
  /** Verified invoice value held in open disputes, de-duplicated (paise). */
  exposurePaise: number;
  /** Open disputes whose amount is withheld (payment claims, no invoice). */
  unpricedOpen: number;
}

/**
 * Exposure: the ledger value of the invoices that open disputes hold.
 * An invoice counts once however many open disputes name it, and a
 * duplicate claim covers its whole candidate pair (only one of a duplicate
 * pair is at stake). Payment-claim disputes count nothing.
 */
export function exposurePaise(cases: DisputeCase[]): number {
  const counted = new Set<string>();
  let sum = 0;
  const ordered = [...cases].sort((a, b) => a.dispute.dispute_id.localeCompare(b.dispute.dispute_id));
  for (const c of ordered) {
    if (!c.open || c.amountPaise === null) continue;
    if (c.invoiceIds.some((id) => counted.has(id))) continue;
    sum += c.amountPaise;
    for (const id of c.invoiceIds) counted.add(id);
  }
  return sum;
}

export function kpisFor(cases: DisputeCase[]): DisputeKpis {
  const count = (g: DisputeGroup) => cases.filter((c) => c.group === g).length;
  return {
    total: cases.filter((c) => c.open).length,
    needsResponse: count("needs_response"),
    awaitingCustomer: count("awaiting_customer"),
    inResolution: count("in_resolution"),
    closed: count("closed"),
    exposurePaise: exposurePaise(cases),
    unpricedOpen: cases.filter((c) => c.open && c.amountPaise === null).length,
  };
}

// --- Filter -----------------------------------------------------------------

export interface DisputeFilters {
  query: string;
  status: StatusFilter;
  type: DisputeType | "all";
  age: AgeFilter;
}

export const DEFAULT_FILTERS: DisputeFilters = { query: "", status: "all", type: "all", age: "all" };

export function isFiltered(f: DisputeFilters): boolean {
  return f.query.trim() !== "" || f.status !== "all" || f.type !== "all" || f.age !== "all";
}

/** Text a search matches: customer, invoice ids/numbers, type, claim, email, recommendation, owner. */
export function searchText(c: DisputeCase, typeLabel: string): string {
  return lc(
    [
      c.dispute.dispute_id,
      c.customerName,
      c.dispute.customer_id,
      ...c.invoiceIds,
      c.invoice?.invoice_number ?? "",
      typeLabel,
      c.dispute.claim_text,
      c.dispute.ai_recommendation,
      c.dispute.assigned_reviewer ?? "",
      c.email?.subject ?? "",
      c.email?.from_address ?? "",
    ].join(" \u0000 "),
  );
}

export function filterCases(
  cases: DisputeCase[],
  f: DisputeFilters,
  typeLabel: (t: DisputeType) => string,
): DisputeCase[] {
  const terms = lc(f.query).split(/\s+/).filter(Boolean);
  return cases.filter((c) => {
    if (!matchesStatus(c.dispute.status, f.status)) return false;
    if (f.type !== "all" && c.dispute.type !== f.type) return false;
    if (!matchesAge(c.age, f.age)) return false;
    if (terms.length === 0) return true;
    const hay = searchText(c, typeLabel(c.dispute.type));
    return terms.every((t) => hay.includes(t));
  });
}

// --- Sort -------------------------------------------------------------------

export const SORTS = ["latest", "oldest", "longest_unresolved", "highest_amount", "priority"] as const;
export type DisputeSort = (typeof SORTS)[number];

export const SORT_LABELS: Record<DisputeSort, string> = {
  latest: "Latest first",
  oldest: "Oldest first",
  longest_unresolved: "Longest unresolved",
  highest_amount: "Highest amount",
  priority: "Priority",
};

/** Lower is more urgent: unanswered first, then work in hand, then waiting, then closed. */
const GROUP_URGENCY: Record<DisputeGroup, number> = {
  needs_response: 0,
  in_resolution: 1,
  awaiting_customer: 2,
  closed: 3,
};

const byId = (a: DisputeCase, b: DisputeCase) => a.dispute.dispute_id.localeCompare(b.dispute.dispute_id);
/** Unknown dates/amounts always sort last, whatever the direction. */
function nullsLast<T>(a: T | null | undefined, b: T | null | undefined, cmp: (x: T, y: T) => number): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return cmp(a, b);
}
const desc = (x: number, y: number) => y - x;
const strDesc = (x: string, y: string) => y.localeCompare(x);
const strAsc = (x: string, y: string) => x.localeCompare(y);

export function sortCases(cases: DisputeCase[], sort: DisputeSort): DisputeCase[] {
  const cmp = (a: DisputeCase, b: DisputeCase): number => {
    switch (sort) {
      case "latest":
        return nullsLast(a.createdAt, b.createdAt, strDesc);
      case "oldest":
        return nullsLast(a.createdAt, b.createdAt, strAsc);
      case "longest_unresolved": {
        // Open before closed; among open, the oldest first.
        if (a.open !== b.open) return a.open ? -1 : 1;
        return nullsLast(a.age, b.age, desc);
      }
      case "highest_amount":
        return nullsLast(a.amountPaise, b.amountPaise, desc);
      case "priority": {
        const g = GROUP_URGENCY[a.group] - GROUP_URGENCY[b.group];
        if (g !== 0) return g;
        const amt = nullsLast(a.amountPaise, b.amountPaise, desc);
        if (amt !== 0) return amt;
        return nullsLast(a.age, b.age, desc);
      }
    }
  };
  return [...cases].sort((a, b) => cmp(a, b) || byId(a, b));
}

// --- Pages ------------------------------------------------------------------

export const PAGE_SIZE = 6;

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  /** 1-based index of the first item shown, 0 when there are none. */
  from: number;
  to: number;
  total: number;
}

/** Clamps `page` into range, so a filter that shrinks the list never strands the view. */
export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: p,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  };
}

// --- Export -----------------------------------------------------------------

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of the given cases. Amounts are exact rupees from the ledger, blank when withheld. */
export function toCsv(
  cases: DisputeCase[],
  labels: { type: (t: DisputeType) => string; status: (s: DisputeStatus) => string },
): string {
  const header = ["Dispute", "Status", "Invoice", "Customer", "Type", "Amount (INR)", "Age (days)", "Owner", "Raised"];
  const rows = cases.map((c) => [
    c.dispute.dispute_id,
    labels.status(c.dispute.status),
    c.invoiceLabel,
    c.customerName,
    labels.type(c.dispute.type),
    c.amountPaise === null ? "" : (c.amountPaise / 100).toFixed(2),
    c.age === null ? "" : String(c.age),
    c.dispute.assigned_reviewer ?? "Unassigned",
    c.createdAt ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
