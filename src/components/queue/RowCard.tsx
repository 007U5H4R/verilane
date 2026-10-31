import { formatInr, paise } from "@/domain/money";
import { outstandingOf } from "@/domain/priority";
import type { Customer, Invoice, Payment, Priority, PriorityBand } from "@/domain/schema";
import { Badge } from "@/components/ui/badge";
import { BAND_LABELS, PriorityChip } from "./PriorityChip";

/** Bands held out of chasing (TASK-9.5): shown muted with a badge, never removed. */
export const EXCLUDED_BANDS: readonly PriorityBand[] = ["disputed", "hold_reconcile", "on_hold_promised"];

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
  const excluded = EXCLUDED_BANDS.includes(priority.band);

  return (
    <a
      href={`/invoices/${invoice.invoice_id}`}
      data-excluded={excluded || undefined}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none lg:h-16 lg:flex-nowrap lg:gap-4 lg:py-0 ${
        excluded ? "bg-[color-mix(in_srgb,var(--disp-bg)_45%,var(--surface))] text-text-muted" : ""
      }`}
    >
      <span className="order-6 lg:order-none">
        <PriorityChip band={priority.band} />
      </span>
      <span className="order-4 font-mono text-sm text-text-muted shrink-0 lg:order-none">
        {invoice.invoice_number ?? "—"}
      </span>
      <span className={`order-1 min-w-0 flex-1 truncate lg:order-none ${excluded ? "text-text-muted" : "text-text"}`}>
        {customer?.name ?? invoice.customer_id}
      </span>
      <span className={`order-2 tabular-nums shrink-0 lg:order-none ${excluded ? "text-text-muted" : "text-text"}`}>{formatInr(paise(outstanding))}</span>
      {/* <1024: forces line 2 (invoice no. · days overdue · chip), Design.md §13. */}
      <span aria-hidden="true" className="order-3 h-0 basis-full lg:hidden" />
      <span className="order-5 shrink-0 text-text-muted lg:order-none lg:w-28">
        {daysOverdue === null ? "—" : `${daysOverdue}d overdue`}
      </span>
      <span className="hidden min-w-0 flex-[2] truncate text-text-muted lg:block">{priority.reason}</span>
      {excluded && (
        // The row is one link, so the badge carries its cause (G4/G5/G7) as a title, not a nested link.
        <Badge
          variant="outline"
          className="order-7 shrink-0 lg:order-none"
          data-testid="excluded-badge"
          data-band={priority.band}
          title={priority.reason}
        >
          {BAND_LABELS[priority.band]} — excluded from queue
        </Badge>
      )}
    </a>
  );
}
