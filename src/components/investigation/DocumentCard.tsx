import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { PriorityChip } from "@/components/queue/PriorityChip";
import { formatDate } from "@/domain/clock";
import { formatInr, type Paise } from "@/domain/money";
import type { Customer, Invoice, Priority } from "@/domain/schema";

/** Re-exported for existing importers; the one formatter lives in clock.ts (R7). */
export { formatDate };

/**
 * The Investigation document card (Design.md §14): priority, customer
 * (serif), invoice no. + dates, outstanding amount, From → To. The priority
 * reason and evidence tables render inside it as `children`.
 */
export function DocumentCard({
  invoice,
  priority,
  customer,
  outstandingPaise,
  children,
}: {
  invoice: Invoice;
  priority: Priority;
  customer: Customer | undefined;
  outstandingPaise: Paise;
  children: ReactNode;
}) {
  const days = priority.days_overdue;
  const customerName = customer?.name ?? invoice.customer_id;
  const contact = customer?.contact_emails[0];

  return (
    <article className="rounded-lg border border-border glass shadow-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2">
            <PriorityChip band={priority.band} />
            {priority.score !== undefined && (
              <span className="text-xs text-text-muted tabular-nums">score {priority.score}</span>
            )}
          </span>
          <h1 className="mt-2.5 font-display text-[28px] leading-tight font-semibold text-text">
            {customerName}
          </h1>
          <p className="text-text-muted">
            <span className="font-mono">{invoice.invoice_number ?? "No invoice number"}</span>
            {" · issued "}
            {formatDate(invoice.invoice_date)}
            {" · "}
            {invoice.due_date === null ? "no due date" : `due ${formatDate(invoice.due_date)}`}
          </p>
        </div>
        <div className="sm:text-right">
          <div className="font-display text-[30px] font-semibold text-text tabular-nums">
            {formatInr(outstandingPaise)}
          </div>
          <div className="text-text-muted">
            {days === null
              ? "Days overdue unknown"
              : days <= 0
                ? "Not yet overdue"
                : `${days} days overdue`}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-md border border-border px-4 py-3">
        <div className="flex flex-col">
          <span className="text-xs text-text-muted">From</span>
          <b className="font-semibold">Verilane Collections</b>
        </div>
        <ArrowRight aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-text-muted" />
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-text-muted">To</span>
          <b className="font-semibold">{customerName}</b>
          {contact && (
            <span className="truncate font-mono text-xs text-text-muted">{contact}</span>
          )}
        </div>
      </div>

      {children}
    </article>
  );
}
