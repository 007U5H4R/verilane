"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Below md: the facet groups in a bottom sheet (shell MoreSheet's pattern). */
export function FilterSheet({
  id,
  open,
  onClose,
  matched,
  children,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  matched: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-lg border-t border-border bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-text shadow-lg backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 id={titleId} className="text-sm font-semibold">
          Filters
        </h2>
        <button
          type="button"
          aria-label="Close filters"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full text-text-muted"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="px-4 pb-4">{children}</div>
      <div className="sticky bottom-0 border-t border-border bg-surface px-4 py-3">
        <Button className="w-full" onClick={onClose}>
          Show {matched} {matched === 1 ? "invoice" : "invoices"}
        </Button>
      </div>
    </dialog>
  );
}
