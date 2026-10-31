import { formatInr, paise } from "@/domain/money";
import { outstandingOf } from "@/domain/priority";
import type { Customer, Invoice, Payment, Priority } from "@/domain/schema";
import { PriorityChip } from "./PriorityChip";

/**
 * One Queue row (TASK-7.8 / technical-plan.md): chip · invoice no. (mono) ·
 * customer · outstanding (tabular) · days overdue · reason. The whole row
 * is one link to Investigation (Design.md §13).
 */
export function RowCard({
  invoice,
  priority,
  customer,
  payments,
}: {
  invoice: Invoice;
  priority: Priority;
  customer: Customer | undefined;
  payments: Payment[];
}) {
  const outstanding = outstandingOf(invoice, { payments });
  const daysOverdue = priority.days_overdue;

  return (
    <a
      href={`/invoices/${invoice.invoice_id}`}
      className="flex h-16 items-center gap-4 border-b border-border px-4 hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
    >
      <PriorityChip band={priority.band} />
      <span className="font-mono text-sm text-text-muted shrink-0">
        {invoice.invoice_number ?? "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-text">
        {customer?.name ?? invoice.customer_id}
      </span>
      <span className="tabular-nums shrink-0 text-text">{formatInr(paise(outstanding))}</span>
      <span className="w-28 shrink-0 text-text-muted">
        {daysOverdue === null ? "—" : `${daysOverdue}d overdue`}
      </span>
      <span className="min-w-0 flex-[2] truncate text-text-muted">{priority.reason}</span>
    </a>
  );
}
