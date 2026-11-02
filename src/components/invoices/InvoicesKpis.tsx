import { AlertTriangle, CircleCheck, IndianRupee, Scale, type LucideIcon } from "lucide-react";
import { formatInr } from "@/domain/money";
import type { RegisterKpis } from "@/domain/invoices/register";

interface Card {
  key: string;
  label: string;
  value: (k: RegisterKpis) => string;
  hint: (k: RegisterKpis) => string;
  icon: LucideIcon;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const CARDS: Card[] = [
  {
    key: "outstanding",
    label: "Total outstanding",
    value: (k) => formatInr(k.outstanding),
    hint: (k) => `Across ${n(k.openCount, "open invoice", "open invoices")}`,
    icon: IndianRupee,
  },
  {
    key: "overdue",
    label: "Overdue",
    value: (k) => String(k.overdueCount),
    hint: (k) => (k.overdueCount ? `${formatInr(k.overdueAmount)} past due` : "Nothing past due"),
    icon: AlertTriangle,
  },
  {
    key: "disputed",
    label: "Disputed",
    value: (k) => String(k.disputedCount),
    hint: (k) => (k.disputedCount ? `${formatInr(k.disputedAmount)} under an open dispute` : "No open disputes"),
    icon: Scale,
  },
  {
    key: "closed",
    label: "Paid / closed",
    value: (k) => String(k.closedCount),
    hint: (k) => `Of ${n(k.total, "invoice", "invoices")}`,
    icon: CircleCheck,
  },
];

/** Four static figures from the rows in view. No trends: there is no history to compare against. */
export function InvoicesKpis({ kpis }: { kpis: RegisterKpis }) {
  return (
    <ul aria-label="Invoice totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((c) => {
        const Icon = c.icon;
        return (
          <li
            key={c.key}
            data-testid={`invoices-kpi-${c.key}`}
            className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-3 shadow-card md:p-4"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-tint text-brand-strong max-sm:hidden">
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-text-muted">{c.label}</span>
              <span className="break-words font-display text-xl font-semibold leading-tight tabular-nums text-text md:text-2xl">{c.value(kpis)}</span>
              <span className="text-[11px] leading-snug tabular-nums text-text-muted">{c.hint(kpis)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
