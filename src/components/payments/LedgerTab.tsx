"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/domain/clock";
import { formatInr, paise } from "@/domain/money";
import {
  LEDGER_SORTS,
  filterLedger,
  isLedgerSort,
  ledgerTotals,
  paginate,
  sortLedger,
  toCsv,
  type LedgerListRow,
} from "@/domain/payments/listing";
import { LEDGER_STATUS_META, MISSING, ledgerStatus, type LedgerStatus } from "@/domain/payments/reconcile";
import type { Customer, Invoice, Payment } from "@/domain/schema";
import { cn } from "@/lib/cn";
import type { PaymentsModel } from "./model";
import { CARD, Field, INPUT, LINK, Pager, SELECT, useUrlState } from "./parts";
import { download } from "./download";
import { StatusPill } from "./tone";

const PAGE_SIZE = 20;
const STATUSES: LedgerStatus[] = ["verified", "candidate", "recorded"];
const isStatus = (v: unknown): v is LedgerStatus => STATUSES.includes(v as LedgerStatus);

interface Row extends LedgerListRow {
  payment: Payment;
  invoice?: Invoice;
  customer?: Customer;
}

/** The payments ledger, read only. Totals are ledger sums only; nothing here writes the ledger. */
export function LedgerTab({ model }: { model: PaymentsModel }) {
  const { params, set } = useUrlState();
  const q = params.get("lq") ?? "";
  const cust = params.get("lcust") ?? "";
  const rawStatus = params.get("lstatus");
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const rawSort = params.get("lsort");
  const sort = isLedgerSort(rawSort) ? rawSort : "latest";
  const pageNo = Number(params.get("lpage") ?? "1") || 1;
  const [openId, setOpenId] = useState<string | null>(null);

  const all: Row[] = useMemo(
    () =>
      model.data.payments.map((p) => {
        const invoice = model.data.invoices.get(p.invoice_id);
        const customer = invoice ? model.data.customers.get(invoice.customer_id) : undefined;
        return {
          id: p.payment_id,
          paidOn: p.paid_on,
          amount: paise(p.amount_paise),
          customerId: invoice?.customer_id,
          status: ledgerStatus(p.payment_id, model.verifiedIds, model.candidateIds),
          haystack: [p.payment_id, p.invoice_id, invoice?.invoice_number ?? "", customer?.name ?? ""],
          payment: p,
          invoice,
          customer,
        };
      }),
    [model],
  );
  const shown = sortLedger(filterLedger(all, { q, customerId: cust || undefined, status }), sort);
  const page = paginate(shown, pageNo, PAGE_SIZE);
  const totals = ledgerTotals(shown, all);
  const filtered = q !== "" || cust !== "" || status !== undefined;
  const open = openId ? all.find((r) => r.id === openId) : undefined;

  if (all.length === 0) {
    return (
      <p data-testid="ledger-empty" className={cn(CARD, "p-4 text-[13px] text-text-muted")}>
        No payments recorded in the ledger.
      </p>
    );
  }

  const exportCsv = () =>
    download(
      toCsv(
        ["Paid on", "Payment", "Invoice", "Customer", "Amount (INR)", "Status"],
        shown.map((r) => [
          r.paidOn,
          r.id,
          r.invoice?.invoice_number ?? r.payment.invoice_id,
          r.customer?.name ?? MISSING.na,
          ((r.amount as number) / 100).toFixed(2),
          LEDGER_STATUS_META[r.status].label,
        ]),
      ),
      "verilane-ledger.csv",
    );

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(CARD, "grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]")}>
        <Field label="Search ledger">
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              className={cn(INPUT, "pl-9")}
              placeholder="Payment, invoice or customer"
              value={q}
              onChange={(e) => set({ lq: e.target.value, lpage: null })}
            />
          </span>
        </Field>
        <Field label="Customer">
          <select className={SELECT} value={cust} onChange={(e) => set({ lcust: e.target.value, lpage: null })}>
            <option value="">All customers</option>
            {model.customers.map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={SELECT} value={status ?? ""} onChange={(e) => set({ lstatus: e.target.value, lpage: null })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEDGER_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort">
          <select className={SELECT} value={sort} onChange={(e) => set({ lsort: e.target.value === "latest" ? null : e.target.value })}>
            {LEDGER_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="h-9 w-full rounded-full" onClick={exportCsv} disabled={shown.length === 0}>
            <Download aria-hidden className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <p className="text-[13px] text-text-muted" data-testid="ledger-totals" aria-live="polite">
        {filtered ? (
          <>
            Showing <span className="font-medium tabular-nums text-text">{formatInr(paise(totals.displayed))}</span> across{" "}
            {totals.displayedCount} {totals.displayedCount === 1 ? "payment" : "payments"} · Full ledger{" "}
            <span className="font-medium tabular-nums text-text">{formatInr(paise(totals.full))}</span> across {totals.fullCount}
          </>
        ) : (
          <>
            Full ledger <span className="font-medium tabular-nums text-text">{formatInr(paise(totals.full))}</span> across{" "}
            {totals.fullCount} {totals.fullCount === 1 ? "payment" : "payments"}
          </>
        )}
      </p>

      {shown.length === 0 ? (
        <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-2 p-4 text-[13px] text-text-muted")}>
          No ledger entries match these filters.
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => set({ lq: null, lcust: null, lstatus: null, lpage: null })}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop and tablet: a table. */}
          <div className={cn(CARD, "hidden overflow-x-auto md:block")}>
            <table className="w-full border-collapse text-[13px]" aria-label="Payments ledger">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">Paid on</th>
                  <th scope="col" className="px-4 py-2 font-medium">Payment</th>
                  <th scope="col" className="px-4 py-2 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-2 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((r) => {
                  const st = LEDGER_STATUS_META[r.status];
                  return (
                    <tr key={r.id} data-testid="ledger-row" className="border-b border-border last:border-b-0 hover:bg-mint-pale/40">
                      <td className="px-4 py-2 text-text">{formatDate(r.paidOn)}</td>
                      <td className="px-4 py-2 font-mono text-text-muted">{r.id}</td>
                      <td className="px-4 py-2">
                        <Link href={`/invoices/${r.payment.invoice_id}`} className={LINK}>
                          {r.invoice?.invoice_number ?? r.payment.invoice_id}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-text">{r.customer?.name ?? MISSING.na}</td>
                      <td className="px-4 py-2">
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text">{formatInr(r.amount)}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" className={cn(LINK, "text-xs")} onClick={() => setOpenId(r.id)} aria-label={`Details for ${r.id}`}>
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone: cards. */}
          <ul className="flex flex-col gap-2 md:hidden" aria-label="Payments ledger entries">
            {page.items.map((r) => {
              const st = LEDGER_STATUS_META[r.status];
              return (
                <li key={r.id} data-testid="ledger-card" className={cn(CARD, "flex flex-col gap-1 p-3")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-medium text-text">{r.customer?.name ?? MISSING.na}</span>
                    <span className="tabular-nums text-sm font-semibold text-text">{formatInr(r.amount)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                    <span>
                      {formatDate(r.paidOn)} · <span className="font-mono">{r.id}</span> ·{" "}
                      <Link href={`/invoices/${r.payment.invoice_id}`} className={LINK}>
                        {r.invoice?.invoice_number ?? r.payment.invoice_id}
                      </Link>
                    </span>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </div>
                  <button type="button" className={cn(LINK, "w-fit text-xs")} onClick={() => setOpenId(r.id)} aria-label={`Details for ${r.id}`}>
                    Details
                  </button>
                </li>
              );
            })}
          </ul>

          <Pager page={page} onPage={(p) => set({ lpage: p <= 1 ? null : String(p) })} label="Ledger pages" />
        </>
      )}

      <AlertDialog open={open !== undefined} onOpenChange={(o) => !o && setOpenId(null)}>
        {open && (
          <AlertDialogContent
            data-testid="ledger-drawer"
            className="top-0 right-0 left-auto h-dvh max-w-md translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none border-y-0 border-r-0"
          >
            <div className="flex items-start justify-between gap-2">
              <AlertDialogTitle>Ledger entry {open.id}</AlertDialogTitle>
              <AlertDialogCancel className="size-8 rounded-full p-0" aria-label="Close">
                <X aria-hidden className="size-4" />
              </AlertDialogCancel>
            </div>
            <AlertDialogDescription>Recorded in the ledger. This view is read only; nothing here changes the entry.</AlertDialogDescription>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-text-muted">Amount</dt>
              <dd className="font-semibold tabular-nums text-text">{formatInr(open.amount)}</dd>
              <dt className="text-text-muted">Paid on</dt>
              <dd className="text-text">{formatDate(open.paidOn)}</dd>
              <dt className="text-text-muted">Invoice</dt>
              <dd>
                <Link href={`/invoices/${open.payment.invoice_id}`} className={LINK}>
                  {open.invoice?.invoice_number ?? open.payment.invoice_id}
                </Link>
              </dd>
              <dt className="text-text-muted">Customer</dt>
              <dd className="text-text">{open.customer?.name ?? MISSING.na}</dd>
              <dt className="text-text-muted">UTR / reference</dt>
              <dd className="text-text">{MISSING.na}</dd>
              <dt className="text-text-muted">Method</dt>
              <dd className="text-text">{MISSING.na}</dd>
              <dt className="text-text-muted">Status</dt>
              <dd>
                <StatusPill tone={LEDGER_STATUS_META[open.status].tone}>{LEDGER_STATUS_META[open.status].label}</StatusPill>
              </dd>
            </dl>
            <ClaimsFor model={model} paymentId={open.id} />
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

/** The claims a person verified against, or could verify against, this entry. */
function ClaimsFor({ model, paymentId }: { model: PaymentsModel; paymentId: string }) {
  const verified = model.data.items.filter((r) => r.verified_payment_id === paymentId);
  const candidates = model.cases.filter((c) => c.open && c.candidates.some((k) => k.linkable && k.payment.payment_id === paymentId));
  if (verified.length === 0 && candidates.length === 0) {
    return <p className="text-[13px] text-text-muted">No email claim points at this entry.</p>;
  }
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <h3 className="font-semibold text-text">Linked email claims</h3>
      <ul className="flex flex-col gap-1">
        {verified.map((r) => (
          <li key={r.review_id} className="text-text">
            <span className="font-mono">{r.message_id}</span> — verified
            {r.verified_reference ? ` (reference ${r.verified_reference})` : ""}
          </li>
        ))}
        {candidates.map((c) => (
          <li key={c.case.id} className="text-text">
            <span className="font-mono">{c.case.id}</span> — claim pending review
          </li>
        ))}
      </ul>
    </div>
  );
}
