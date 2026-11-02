"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Scale } from "lucide-react";
import { formatDate } from "@/domain/clock";
import { formatInr } from "@/domain/money";
import {
  DEFAULT_DESC,
  STATUS_LABEL,
  balanceState,
  overdueState,
  type InvoiceRow,
  type RegisterSort,
  type SortKey,
} from "@/domain/invoices/register";
import type { InvoiceStatus } from "@/domain/schema";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<InvoiceStatus, string> = {
  open: "bg-info-bg text-info",
  partially_paid: "bg-med-bg text-med",
  paid: "bg-low-bg text-low",
  written_off: "bg-surface-sunken text-text-muted",
  unknown: "bg-surface-sunken text-text-muted",
};

const NA = "Not available.";

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_TONE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const TH = "px-3 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap";
const TD = "px-3 py-3 align-top max-xl:px-0 max-xl:py-0.5";
/** Mobile card label (desktop gets it from the column header). */
const LBL = "xl:hidden text-[11px] text-text-muted mr-1.5";

function SortHeader({ k, label, sort, onSort, align }: { k: SortKey; label: string; sort: RegisterSort; onSort: (s: RegisterSort) => void; align?: "right" }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.desc ? ArrowDown : ArrowUp;
  return (
    <th scope="col" className={cn(TH, align === "right" && "text-right")} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => onSort({ key: k, desc: active ? !sort.desc : DEFAULT_DESC[k] })}
        className={cn("inline-flex items-center gap-1 rounded hover:text-text", active && "text-text")}
      >
        {label}
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </th>
  );
}

/**
 * The register table. One DOM at every width: below xl each row restyles as
 * a stacked card (headers visually hidden, cells labelled inline).
 */
export function InvoicesTable({ rows, sort, onSort }: { rows: InvoiceRow[]; sort: RegisterSort; onSort: (s: RegisterSort) => void }) {
  return (
    <div className="relative rounded-lg border border-border bg-surface shadow-card xl:overflow-x-auto max-xl:border-0 max-xl:bg-transparent max-xl:shadow-none">
      <table className="w-full border-collapse text-[13px] max-xl:block" aria-label="Invoices" data-sort={`${sort.key}.${sort.desc ? "desc" : "asc"}`}>
        <thead className="border-b border-border bg-surface-sunken max-xl:sr-only">
          <tr>
            <SortHeader k="number" label="Invoice" sort={sort} onSort={onSort} />
            <th scope="col" className={TH}>Customer</th>
            <th scope="col" className={TH}>Issued</th>
            <SortHeader k="due" label="Due" sort={sort} onSort={onSort} />
            <SortHeader k="amount" label="Amount" sort={sort} onSort={onSort} align="right" />
            <th scope="col" className={cn(TH, "text-right")}>Balance</th>
            <th scope="col" className={TH}>Status</th>
            <SortHeader k="overdue" label="Days overdue" sort={sort} onSort={onSort} />
            <th scope="col" className={TH}>Dispute</th>
            <th scope="col" className={TH}>
              <span className="sr-only">Investigate</span>
            </th>
          </tr>
        </thead>
        <tbody className="max-xl:flex max-xl:flex-col max-xl:gap-3">
          {rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row: r }: { row: InvoiceRow }) {
  const od = overdueState(r);
  const bal = balanceState(r);
  const href = `/invoices/${encodeURIComponent(r.id)}`;
  return (
    <tr
      data-testid="invoice-row"
      data-invoice-id={r.id}
      className="border-b border-border last:border-b-0 hover:bg-surface-sunken/60 max-xl:grid max-xl:grid-cols-2 md:max-xl:grid-cols-4 md:max-xl:p-4 max-xl:gap-x-3 max-xl:gap-y-1 max-xl:rounded-lg max-xl:border max-xl:bg-surface max-xl:p-3 max-xl:shadow-card max-xl:last:border-b"
    >
      <td className={cn(TD, "whitespace-nowrap max-xl:col-span-1")}>
        <Link href={href} className="font-semibold text-interactive hover:underline">
          {r.number ?? <span className="font-normal italic">Number {NA}</span>}
        </Link>
        {!r.number && <span className="block font-mono text-[11px] text-text-muted">{r.id}</span>}
      </td>
      {/* Mobile cards show the status beside the number; desktop has its own column. */}
      <td className={cn(TD, "xl:hidden max-xl:col-start-2 md:max-xl:col-start-4 max-xl:row-start-1 max-xl:text-right")}>
        <StatusBadge status={r.status} />
      </td>
      <td className={cn(TD, "min-w-0 max-xl:col-span-2 xl:max-w-[16rem]")}>
        {r.customerName ? (
          <span className="block text-text">{r.customerName}</span>
        ) : (
          <>
            <span className="block font-mono text-text">{r.customerId}</span>
            <span className="block text-[11px] text-text-muted">Name {NA}</span>
          </>
        )}
      </td>
      <td className={cn(TD, "whitespace-nowrap tabular-nums text-text-muted")}>
        <span className={LBL}>Issued</span>
        {formatDate(r.issueDate)}
      </td>
      <td className={cn(TD, "whitespace-nowrap tabular-nums text-text")}>
        <span className={LBL}>Due</span>
        {r.dueDate ? formatDate(r.dueDate) : <span className="text-text-muted">{NA}</span>}
      </td>
      <td className={cn(TD, "whitespace-nowrap text-right tabular-nums text-text max-xl:text-left")}>
        <span className={LBL}>Amount</span>
        {formatInr(r.amount)}
      </td>
      <td className={cn(TD, "whitespace-nowrap text-right tabular-nums max-xl:text-left")}>
        <span className={LBL}>Balance</span>
        <Balance state={bal} />
      </td>
      <td className={cn(TD, "max-xl:hidden")}>
        <StatusBadge status={r.status} />
      </td>
      <td className={cn(TD, "whitespace-nowrap tabular-nums")} data-testid="invoice-overdue">
        <span className={LBL}>Days overdue</span>
        <span
          className={cn(
            od.kind === "overdue" ? "font-semibold text-high" : "text-text-muted",
            od.kind === "unknown" && "italic",
          )}
          title={od.kind === "unknown" ? "No due date on the ledger, so days overdue can't be worked out." : undefined}
        >
          {od.label}
        </span>
      </td>
      <td className={TD}>
        {r.disputeIds.length > 0 ? (
          <Link
            href={`/disputes/${encodeURIComponent(r.disputeIds[0]!)}`}
            className="inline-flex items-center gap-1 rounded-md bg-disp-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-disp hover:underline"
            data-testid="invoice-dispute"
          >
            <Scale className="size-3.5" aria-hidden="true" />
            {r.disputeIds.length === 1 ? "Disputed" : `${r.disputeIds.length} disputes`}
          </Link>
        ) : (
          <span className="text-text-muted max-xl:hidden">
            <span aria-hidden="true">—</span>
            <span className="sr-only">No open dispute</span>
          </span>
        )}
      </td>
      <td className={cn(TD, "text-right max-xl:col-span-2 max-xl:pt-2 max-xl:text-left")}>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-medium whitespace-nowrap text-interactive hover:underline xl:min-h-0"
          aria-label={`Investigate invoice ${r.number ?? r.id}`}
        >
          Investigate
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function Balance({ state }: { state: ReturnType<typeof balanceState> }) {
  switch (state.kind) {
    case "due":
      return <span className="text-text">{formatInr(state.amount)} due</span>;
    case "paid":
      return <span className="text-low">Paid in full</span>;
    case "overpaid":
      return <span className="text-med">Overpaid {formatInr(state.amount)}</span>;
    case "written_off":
      return <span className="text-text-muted">Written off {formatInr(state.amount)}</span>;
  }
}
