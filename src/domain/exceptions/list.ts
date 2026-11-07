/**
 * `/exceptions` row model (TKT-75.02, TC-75.11). Pure: one row per stored
 * exception, every kind, with Kind / Subject / Amount / Status / Priority
 * read from stored rows only — nothing estimated. Filtering reuses the v1
 * Queue facets (search, priority, invoice status, customer, ageing),
 * applied to the exception's related invoice.
 */
import { ageingBucketOfPriority, type AgeingBucket } from "../aggregates";
import type { Paise } from "../money";
import { outstandingOf, type RankItem } from "../priority";
import {
  isPaymentExceptionKind,
  type Customer,
  type Exception,
  type ExceptionKind,
  type Invoice,
  type InvoiceStatus,
  type Payment,
  type Priority,
  type PriorityBand,
} from "../schema";

export type ExceptionStatusLabel = "Open" | "Pending Manager" | "Resolved" | "Dismissed";

export interface ExceptionRow {
  id: string;
  kind: ExceptionKind;
  kindLabel: string;
  subject: string;
  /** `null` when the record carries no amount (rendered "Not available."). */
  amountPaise: Paise | null;
  status: Exception["status"];
  statusLabel: ExceptionStatusLabel;
  /** The related invoice's priority band, when there is one invoice. */
  band: PriorityBand | null;
  invoiceId: string | null;
  customerId: string | null;
  invoiceStatus: InvoiceStatus | null;
  ageing: AgeingBucket | null;
  /** Disputed or closed invoices are excluded from the queue: shown muted (Design-TASK-75 §5). */
  muted: boolean;
  href: string;
}

export interface ExceptionSources {
  exceptions: readonly Exception[];
  /** Ranked invoices with their stored priority. */
  items: readonly RankItem[];
  customers: Map<string, Customer>;
  payments: readonly Payment[];
  /** Latest persisted policy verdict per exception id (review m3, EXE185). */
  verdicts?: ReadonlyMap<string, string>;
}

/** The Queue facets the list reuses (sort/page are not used: order is fixed). */
export interface ExceptionFilters {
  q: string;
  band: readonly PriorityBand[];
  status: readonly InvoiceStatus[];
  customer: readonly string[];
  ageing: readonly AgeingBucket[];
}

export const NO_EXCEPTION_FILTERS: ExceptionFilters = { q: "", band: [], status: [], customer: [], ageing: [] };

/** Display labels, kept in step with `REVIEW_KIND_LABEL` (components/emails/labels.ts). */
export const EXCEPTION_KIND_LABEL: Record<ExceptionKind, string> = {
  draft: "Draft review",
  uncertain_match: "Uncertain match",
  dispute: "Dispute review",
  missing_info: "Missing information",
  reconciliation: "Payment reconciliation",
  unallocated_payment: "Unallocated payment",
  short_payment_pattern: "Short-payment pattern",
};

export function exceptionHref(id: string): string {
  return `/exceptions/${encodeURIComponent(id)}`;
}

/**
 * An open item reads "Pending Manager" when its persisted policy verdict is
 * `needs_manager` (review m3, EXE185), so the badge agrees with Stage 3.
 * Before Policy has run (no verdict) it falls back to v1's `requires_role`.
 */
export function exceptionStatusLabel(
  x: Pick<Exception, "status" | "requires_role">,
  // A persisted `PolicyDecisionRow.verdict` (stored loosely as a string).
  verdict?: string | null,
): ExceptionStatusLabel {
  if (x.status === "actioned") return "Resolved";
  if (x.status === "dismissed") return "Dismissed";
  if (verdict != null) return verdict === "needs_manager" ? "Pending Manager" : "Open";
  return x.requires_role === "manager" ? "Pending Manager" : "Open";
}

/** The one invoice an exception is about: its own, or a payment's single candidate. */
export function relatedInvoiceId(x: Exception): string | null {
  if (x.invoice_id !== undefined) return x.invoice_id;
  const c = x.candidate_invoice_ids ?? [];
  return c.length === 1 ? c[0]! : null;
}

const STATUS_ORDER: Record<Exception["status"], number> = { open: 0, actioned: 1, dismissed: 2 };

export function buildExceptionRows(src: ExceptionSources): ExceptionRow[] {
  const byInvoice = new Map<string, { invoice: Invoice; priority: Priority }>(
    src.items.map((i) => [i.invoice.invoice_id, i]),
  );
  const payments = new Map(src.payments.map((p) => [p.payment_id, p]));
  const customerName = (id: string) => src.customers.get(id)?.name ?? id;

  return [...src.exceptions]
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.review_id.localeCompare(b.review_id))
    .map((x) => {
      const invoiceId = relatedInvoiceId(x);
      const related = invoiceId !== null ? byInvoice.get(invoiceId) : undefined;
      const invoice = related?.invoice;
      const priority = related?.priority;

      let subject: string;
      let amountPaise: Paise | null;
      if (isPaymentExceptionKind(x.kind)) {
        const payment = x.payment_id !== undefined ? payments.get(x.payment_id) : undefined;
        subject = `${x.payment_id ?? "Payment"} · ${invoice ? customerName(invoice.customer_id) : "Unapplied bank line"}`;
        amountPaise = payment?.amount_paise ?? null;
      } else {
        subject = invoice
          ? `${customerName(invoice.customer_id)} · ${invoice.invoice_number ?? invoice.invoice_id}`
          : "No invoice linked";
        amountPaise =
          x.email_amount_paise !== undefined
            ? (x.email_amount_paise as unknown as Paise)
            : invoice
              ? outstandingOf(invoice, { payments: [...src.payments] })
              : null;
      }

      return {
        id: x.review_id,
        kind: x.kind,
        kindLabel: EXCEPTION_KIND_LABEL[x.kind],
        subject,
        amountPaise,
        status: x.status,
        statusLabel: exceptionStatusLabel(x, src.verdicts?.get(x.review_id)),
        band: priority?.band ?? null,
        invoiceId: invoice ? invoice.invoice_id : null,
        customerId: invoice?.customer_id ?? null,
        invoiceStatus: invoice?.status ?? null,
        ageing: priority ? ageingBucketOfPriority(priority) : null,
        muted: priority?.band === "disputed" || priority?.band === "closed",
        href: exceptionHref(x.review_id),
      };
    });
}

/** Search (subject, kind label, ids) and each facet; order is kept. */
export function filterExceptionRows(rows: readonly ExceptionRow[], f: ExceptionFilters): ExceptionRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q !== "" && ![r.subject, r.kindLabel, r.id, r.invoiceId ?? ""].some((s) => s.toLowerCase().includes(q))) {
      return false;
    }
    if (f.band.length > 0 && (r.band === null || !f.band.includes(r.band))) return false;
    if (f.status.length > 0 && (r.invoiceStatus === null || !f.status.includes(r.invoiceStatus))) return false;
    if (f.customer.length > 0 && (r.customerId === null || !f.customer.includes(r.customerId))) return false;
    if (f.ageing.length > 0 && (r.ageing === null || !f.ageing.includes(r.ageing))) return false;
    return true;
  });
}
