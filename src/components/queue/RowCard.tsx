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
      className={`flex h-16 items-center gap-4 border-b border-border px-4 hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none ${
        excluded ? "bg-[color-mix(in_srgb,var(--disp-bg)_45%,var(--surface))] text-text-muted" : ""
      }`}
    >
      <PriorityChip band={priority.band} />
      <span className="font-mono text-sm text-text-muted shrink-0">
        {invoice.invoice_number ?? "—"}
      </span>
      <span className={`min-w-0 flex-1 truncate ${excluded ? "text-text-muted" : "text-text"}`}>
        {customer?.name ?? invoice.customer_id}
      </span>
      <span className={`tabular-nums shrink-0 ${excluded ? "text-text-muted" : "text-text"}`}>{formatInr(paise(outstanding))}</span>
      <span className="w-28 shrink-0 text-text-muted">
        {daysOverdue === null ? "—" : `${daysOverdue}d overdue`}
      </span>
      <span className="min-w-0 flex-[2] truncate text-text-muted">{priority.reason}</span>
      {excluded && (
        // The row is one link, so the badge carries its cause (G4/G5/G7) as a title, not a nested link.
        <Badge
          variant="outline"
          className="shrink-0"
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
