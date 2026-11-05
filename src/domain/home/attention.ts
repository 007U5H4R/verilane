/**
 * Home "Needs your attention" feed (TASK-38): the groups of work waiting on
 * the user today, built only from stored records. Pure — no react/next/dexie
 * imports; `src/components/home/*` feeds it hook data.
 *
 * Group order is fixed (decisions first, then disputes, approvals, payment
 * review) and empty groups are dropped, so an empty result means the feed's
 * designed empty state.
 */
import { outstandingOf, type RankItem } from "../priority";
import type { Paise } from "../money";
import type { Payment } from "../schema";
import { EXCEPTION_KIND_LABEL, exceptionHref } from "../exceptions/list";

export type AttentionKey = "high" | "disputed" | "drafts" | "payments" | "exceptions";

export interface AttentionEntry {
  id: string;
  /** Bold line: the customer, or the review kind for a payment item. */
  title: string;
  /** Muted line: the invoice number, or why it has no invoice. */
  detail: string;
  /** Amount to show, or `null` when the record carries none (rendered "Not available."). */
  amountPaise: Paise | null;
  /** Days overdue when the record has one; never computed with arithmetic (TC-056 BigInt isolation). */
  daysOverdue: number | null;
  href: string;
}

export interface AttentionGroup {
  key: AttentionKey;
  /** Count + verb sentence, e.g. "3 high-priority invoices need a decision". */
  summary: string;
  total: number;
  /** The first `ENTRY_LIMIT` entries, in source order. */
  entries: AttentionEntry[];
}

export const ENTRY_LIMIT = 5;

export interface DraftLike {
  draft_id: string;
  invoice_id: string;
  customer_id: string;
  amount_paise: number;
}

export interface PaymentReviewLike {
  review_id: string;
  kind: "uncertain_match" | "reconciliation";
  invoice_id?: string;
  email_amount_paise?: number;
}

/** An open payment-originated exception (TKT-75.02): unallocated cash, short-payment pattern. */
export interface PaymentExceptionLike {
  review_id: string;
  kind: "unallocated_payment" | "short_payment_pattern";
  payment_id?: string;
  /** The bank line's amount, when the payment is on file. */
  amount_paise?: number;
}

export interface AttentionInput {
  items: RankItem[];
  payments: Payment[];
  /** customer_id → display name. */
  customerNames: Map<string, string>;
  drafts: DraftLike[];
  reviews: PaymentReviewLike[];
  /** Open payment exceptions; omitted = none (TC-75.11). */
  exceptions?: PaymentExceptionLike[];
}

const NOUNS: Record<AttentionKey, { one: string; many: string; verbOne: string; verbMany: string }> = {
  high: { one: "high-priority invoice", many: "high-priority invoices", verbOne: "needs a decision", verbMany: "need a decision" },
  disputed: {
    one: "disputed invoice",
    many: "disputed invoices",
    verbOne: "needs dispute resolution",
    verbMany: "need dispute resolution",
  },
  drafts: { one: "reminder draft", many: "reminder drafts", verbOne: "awaits approval", verbMany: "await approval" },
  payments: { one: "payment email", many: "payment emails", verbOne: "needs review", verbMany: "need review" },
  exceptions: { one: "payment exception", many: "payment exceptions", verbOne: "needs review", verbMany: "need review" },
};

export function summaryFor(key: AttentionKey, count: number): string {
  const n = NOUNS[key];
  return count === 1 ? `1 ${n.one} ${n.verbOne}` : `${count} ${n.many} ${n.verbMany}`;
}

export const REVIEW_KIND_LABELS: Record<PaymentReviewLike["kind"], string> = {
  uncertain_match: "Uncertain payment match",
  reconciliation: "Amount doesn’t reconcile",
};

export function invoiceHref(invoiceId: string): string {
  return `/invoices/${encodeURIComponent(invoiceId)}`;
}

export function attentionGroups(input: AttentionInput): AttentionGroup[] {
  const invoices = new Map(input.items.map((i) => [i.invoice.invoice_id, i.invoice]));
  const customer = (id: string) => input.customerNames.get(id) ?? "Customer not available.";
  const number = (id: string) => invoices.get(id)?.invoice_number ?? id;

  const invoiceEntry = (item: RankItem): AttentionEntry => ({
    id: item.invoice.invoice_id,
    title: customer(item.invoice.customer_id),
    detail: item.invoice.invoice_number ?? item.invoice.invoice_id,
    amountPaise: outstandingOf(item.invoice, { payments: input.payments }),
    daysOverdue: item.priority.days_overdue !== null && item.priority.days_overdue > 0 ? item.priority.days_overdue : null,
    href: invoiceHref(item.invoice.invoice_id),
  });

  const lists: Record<AttentionKey, AttentionEntry[]> = {
    high: input.items.filter((i) => i.priority.band === "high").map(invoiceEntry),
    disputed: input.items.filter((i) => i.priority.band === "disputed").map(invoiceEntry),
    drafts: input.drafts.map((d) => ({
      id: d.draft_id,
      title: customer(d.customer_id),
      detail: number(d.invoice_id),
      amountPaise: d.amount_paise as Paise,
      daysOverdue: null,
      href: invoiceHref(d.invoice_id),
    })),
    payments: input.reviews.map((r) => ({
      id: r.review_id,
      title: REVIEW_KIND_LABELS[r.kind],
      detail: r.invoice_id !== undefined ? number(r.invoice_id) : "No invoice linked",
      amountPaise: r.email_amount_paise !== undefined ? (r.email_amount_paise as Paise) : null,
      daysOverdue: null,
      href: r.invoice_id !== undefined ? invoiceHref(r.invoice_id) : "/payments",
    })),
    exceptions: (input.exceptions ?? []).map((x) => ({
      id: x.review_id,
      title: EXCEPTION_KIND_LABEL[x.kind],
      detail: x.payment_id ?? "Payment not available.",
      amountPaise: x.amount_paise !== undefined ? (x.amount_paise as Paise) : null,
      daysOverdue: null,
      href: exceptionHref(x.review_id),
    })),
  };

  const order: AttentionKey[] = ["high", "disputed", "drafts", "payments", "exceptions"];
  return order
    .filter((key) => lists[key].length > 0)
    .map((key) => ({
      key,
      summary: summaryFor(key, lists[key].length),
      total: lists[key].length,
      entries: lists[key].slice(0, ENTRY_LIMIT),
    }));
}
