"use client";

import { useCustomers, usePayments, useQueue } from "@/store/hooks";
import { RowCard } from "./RowCard";

/** The Queue: rank-ordered rows (TASK-7.8 gate: `/queue` lists rows in rank order). */
export function QueueView() {
  const items = useQueue();
  const customers = useCustomers();
  const payments = usePayments();

  if (!items || !customers || !payments) {
    return <p className="p-7 text-text-muted">Loading…</p>;
  }

  if (items.length === 0) {
    return <p className="p-7 text-text-muted">No invoices in the queue.</p>;
  }

  return (
    <div className="flex flex-col">
      {items.map(({ invoice, priority }) => (
        <RowCard
          key={invoice.invoice_id}
          invoice={invoice}
          priority={priority}
          customer={customers.get(invoice.customer_id)}
          payments={payments}
        />
      ))}
    </div>
  );
}
