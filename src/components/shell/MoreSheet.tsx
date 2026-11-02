"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { NAV_ITEMS } from "@/components/shell/NavItems";

export const MORE_HREFS = ["/payments", "/drafts", "/audit", "/settings"];
const MORE_ITEMS = NAV_ITEMS.filter((item) => MORE_HREFS.includes(item.href));

// TASK-20.1: the bottom tabs' "More" sheet (Payments, Drafts, Audit log,
// Settings). TASK-38: variant "menu" backs the top bar's <768 menu button —
// the same sheet listing every nav item. A native modal <dialog> gives focus containment, Escape and an
// inert background without another primitive; `open` drives showModal/close.
export function MoreSheet({
  open,
  onClose,
  activeHref,
  variant = "more",
}: {
  open: boolean;
  onClose: () => void;
  activeHref: string;
  variant?: "more" | "menu";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const title = variant === "menu" ? "Menu" : "More";
  const items = variant === "menu" ? NAV_ITEMS : MORE_ITEMS;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none rounded-t-lg border-t border-border bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-text shadow-lg backdrop:bg-black/40 md:hidden"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 id={titleId} className="text-sm font-semibold">
          {title}
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
      <nav aria-label={title}>
        <ul className="flex flex-col px-2 pb-3">
          {items.map((item) => {
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
