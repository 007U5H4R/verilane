"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { NAV_ITEMS } from "@/components/shell/NavItems";

export const MORE_HREFS = ["/payments", "/drafts", "/audit", "/settings"];
const MORE_ITEMS = NAV_ITEMS.filter((item) => MORE_HREFS.includes(item.href));

// TASK-20.1: the bottom tabs' "More" sheet (Payments, Drafts, Audit log,
// Settings). A native modal <dialog> gives focus containment, Escape and an
// inert background without another primitive; `open` drives showModal/close.
export function MoreSheet({
  open,
  onClose,
  activeHref,
}: {
  open: boolean;
  onClose: () => void;
  activeHref: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="more-sheet-title"
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none rounded-t-lg border-t border-border bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-text shadow-lg backdrop:bg-black/40 md:hidden"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 id="more-sheet-title" className="text-sm font-semibold">
          More
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full text-text-muted"
        >
          <X className="size-5" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <nav aria-label="More">
        <ul className="flex flex-col px-2 pb-3">
          {MORE_ITEMS.map((item) => {
            const isActive = item.href === activeHref;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-text ${
                    isActive ? "bg-brand-tint font-semibold" : ""
                  }`}
                >
                  <Icon className="size-5 text-text-muted" strokeWidth={1.5} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </dialog>
  );
}
