"use client";

import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileWarning, Inbox, Landmark, Wallet, type LucideIcon } from "lucide-react";

import { formatInrWhole, paise } from "@/domain/money";
import type { PaymentsKpis } from "@/domain/payments/reconcile";
import type { Page } from "@/domain/payments/listing";
import { showingText } from "@/domain/payments/listing";
import { cn } from "@/lib/cn";

/* ---------- shared classes ---------- */
// TASK-49 DES-008: fields, tabs and pager buttons are 44px tall below md.

export const SELECT =
  "h-9 max-md:h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-interactive";
export const INPUT =
  "h-9 max-md:h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-interactive";
export const LINK = "font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-interactive rounded-sm";
export const CARD = "rounded-xl border border-border bg-surface shadow-card";

/* ---------- URL state ---------- */

/** Page state kept in the URL so it survives reloads and can be shared. */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return { params, set };
}

/* ---------- header illustration ---------- */

/** A ledger page and an envelope, drawn with theme tokens (decorative). */
export function Illustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 96" aria-hidden="true" focusable="false" className={cn("h-20 w-auto", className)}>
      <rect x="6" y="10" width="96" height="78" rx="10" className="fill-mint-pale stroke-border" strokeWidth="1.5" />
      <rect x="18" y="24" width="44" height="6" rx="3" className="fill-brand-tint" />
      {[40, 52, 64, 76].map((y) => (
        <g key={y}>
          <rect x="18" y={y} width="34" height="4" rx="2" className="fill-border-strong" opacity="0.5" />
          <rect x="66" y={y} width="24" height="4" rx="2" className="fill-brand" opacity="0.7" />
        </g>
      ))}
      <rect x="84" y="34" width="68" height="46" rx="8" className="fill-surface stroke-brand" strokeWidth="1.5" />
      <path d="M86 38 L118 60 L150 38" className="stroke-brand" strokeWidth="1.5" fill="none" />
      <circle cx="146" cy="30" r="10" className="fill-brand" />
      <path d="M141 30 l3.5 3.5 l6.5 -7" className="stroke-on-brand" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- KPI cards ---------- */

export type TabId = "reconcile" | "unmatched" | "ledger";

const KPI_DEFS: Array<{ id: TabId; key: keyof PaymentsKpis; title: string; icon: LucideIcon; hint: (k: PaymentsKpis) => string }> = [
  { id: "reconcile", key: "needsReconciliation", title: "Needs Reconciliation", icon: FileWarning, hint: () => "Payments to match with ledger" },
  { id: "unmatched", key: "unmatchedEmails", title: "Unmatched Emails", icon: Inbox, hint: () => "Payment emails without clear match" },
  { id: "ledger", key: "ledgerEntries", title: "Ledger Entries", icon: Landmark, hint: () => "Total recorded payments" },
  {
    id: "ledger",
    key: "ledgerTotal",
    title: "Total Value (Ledger)",
    icon: Wallet,
    hint: (k) => `Across ${k.ledgerEntries} ${k.ledgerEntries === 1 ? "payment" : "payments"}`,
  },
];

export function KpiCards({ kpis, onPick }: { kpis: PaymentsKpis; onPick: (tab: TabId) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Payments summary">
      {KPI_DEFS.map((d) => {
        const Icon = d.icon;
        const value = d.key === "ledgerTotal" ? formatInrWhole(paise(kpis.ledgerTotal)) : String(kpis[d.key]);
        return (
          <li key={d.key}>
            <button
              type="button"
              data-testid={`kpi-${d.key}`}
              onClick={() => onPick(d.id)}
              className={cn(
                CARD,
                "flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive motion-reduce:transition-none",
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-mint-pale text-brand">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium text-text-muted">{d.title}</span>
                <span className="font-display text-2xl font-semibold tabular-nums text-text">{value}</span>
                <span className="text-xs text-text-muted">{d.hint(kpis)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- tabs ---------- */

export const TABS: Array<{ id: TabId; label: string }> = [
  { id: "reconcile", label: "Needs Reconciliation" },
  { id: "unmatched", label: "Unmatched Emails" },
  { id: "ledger", label: "Ledger" },
];

export function isTab(v: unknown): v is TabId {
  return v === "reconcile" || v === "unmatched" || v === "ledger";
}

/** WAI-ARIA tablist: roving tabindex, arrow keys, Home/End. */
export function Tabs({
  active,
  counts,
  onSelect,
  panelId,
}: {
  active: TabId;
  counts: Record<TabId, number>;
  onSelect: (tab: TabId) => void;
  panelId: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onSelect(TABS[next]!.id);
  };
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div role="tablist" aria-label="Payments views" className="inline-flex min-w-max gap-1 rounded-full border border-border bg-surface p-1">
        {TABS.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`payments-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => {
                if (selected) document.getElementById(panelId)?.focus();
                else onSelect(t.id);
              }}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium max-md:min-h-11 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive motion-reduce:transition-none",
                selected ? "bg-brand-strong text-on-brand" : "text-text-muted hover:bg-mint-pale hover:text-text",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  selected ? "bg-on-brand/20 text-on-brand" : "bg-surface-sunken text-text-muted",
                )}
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- pager ---------- */

export function Pager({ page, onPage, label }: { page: Page<unknown>; onPage: (p: number) => void; label: string }) {
  const id = useId();
  const nums = Array.from({ length: page.pages }, (_, i) => i + 1);
  const btn =
    "inline-flex size-8 max-md:size-11 items-center justify-center rounded-md border border-border bg-surface text-sm text-text hover:bg-mint-pale disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-interactive";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
      <span id={id} aria-live="polite" className="tabular-nums">
        {showingText(page)}
      </span>
      {page.pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={btn} aria-label="Previous page" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          {nums.map((n) =>
            n === page.page ? (
              <span key={n} aria-current="page" className={cn(btn, "border-brand-strong bg-brand-strong text-on-brand hover:bg-brand-strong")}>
                {n}
              </span>
            ) : (
              <button key={n} type="button" className={btn} aria-label={`Page ${n}`} onClick={() => onPage(n)}>
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            className={btn}
            aria-label="Next page"
            disabled={page.page >= page.pages}
            onClick={() => onPage(page.page + 1)}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </nav>
  );
}

/* ---------- small pieces ---------- */

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs font-medium text-text-muted", className)}>
      {label}
      {children}
    </label>
  );
}

/** A control the current role may not use: aria-disabled, with the reason visible beside it. */
export function DeniedReason({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs text-text-muted">
      {children}
    </p>
  );
}
