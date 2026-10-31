import Link from "next/link";

import { formatDate } from "@/components/investigation/DocumentCard";
import { formatInr, paise } from "@/domain/money";
import type { Customer, Invoice, Payment } from "@/domain/schema";

/** The payments ledger (TASK-13.4): every recorded payment, newest first, linked to its invoice. */
export function LedgerTable({
  payments,
  invoices,
  customers,
}: {
  payments: Payment[];
  invoices: Map<string, Invoice>;
  customers: Map<string, Customer>;
}) {
  if (payments.length === 0) {
    return (
      <p data-testid="ledger-empty" className="rounded-lg border border-border bg-surface p-4 text-[13px] text-text-muted">
        No payments recorded in the ledger.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[520px] border-collapse text-[13px]" aria-label="Payments ledger">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th scope="col" className="px-4 py-2 font-medium">Paid on</th>
            <th scope="col" className="px-4 py-2 font-medium">Payment</th>
            <th scope="col" className="px-4 py-2 font-medium">Invoice</th>
            <th scope="col" className="px-4 py-2 font-medium">Customer</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const invoice = invoices.get(p.invoice_id);
            const customer = invoice ? customers.get(invoice.customer_id) : undefined;
            return (
              <tr key={p.payment_id} data-testid="ledger-row" className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 text-text">{formatDate(p.paid_on)}</td>
                <td className="px-4 py-2 font-mono text-text-muted">{p.payment_id}</td>
                <td className="px-4 py-2">
                  <Link href={`/invoices/${p.invoice_id}`} className="font-medium text-brand hover:underline">
                    {invoice?.invoice_number ?? p.invoice_id}
                  </Link>
                </td>
                <td className="px-4 py-2 text-text">{customer?.name ?? invoice?.customer_id ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text">{formatInr(paise(p.amount_paise))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
