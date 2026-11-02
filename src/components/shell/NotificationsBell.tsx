"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Bell } from "lucide-react";

import { useDismiss } from "@/components/shell/useDismiss";
import { useAttentionCounts } from "@/store/shellHooks";

/**
 * TASK-38: the bell lists what needs a human, from live counts — open
 * disputes, drafts awaiting approval, invoices flagged for review. No
 * invented notifications: zero of everything reads "all caught up".
 */
export function NotificationsBell() {
  const counts = useAttentionCounts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const rows = counts
    ? [
        { n: counts.openDisputes, label: "Open disputes", href: "/disputes" },
        { n: counts.draftsAwaiting, label: "Drafts awaiting approval", href: "/drafts" },
        { n: counts.needsReview, label: "Invoices needing review", href: "/queue" },
      ].filter((r) => r.n > 0)
    : [];
  const total = rows.reduce((sum, r) => sum + r.n, 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={counts ? `Notifications, ${total} need attention` : "Notifications"}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-11 shrink-0 place-items-center rounded-full text-text transition-colors duration-150 hover:bg-mint-pale aria-expanded:bg-mint-pale"
      >
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {total > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[11px] leading-none font-semibold text-on-brand tabular-nums ring-2 ring-surface"
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div
          id="notifications-panel"
          className="absolute top-full right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-2 text-sm shadow-lg"
        >
          <p className="px-2 pt-1 pb-2 font-semibold">Needs attention</p>
          {!counts ? (
            <p role="status" className="px-2 pb-2 text-text-muted">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-2 pb-2 text-text-muted">You’re all caught up.</p>
          ) : (
            <ul>
              {rows.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    onClick={close}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-sunken"
                  >
                    <span>{r.label}</span>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums">
                      {r.n}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
