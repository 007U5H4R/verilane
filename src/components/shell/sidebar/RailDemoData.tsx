"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CalendarDays, Database, RotateCcw } from "lucide-react";

import { formatDate } from "@/components/investigation/DocumentCard";
import { useDismiss } from "@/components/shell/useDismiss";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAsOf } from "@/store/hooks";

/**
 * TASK-38: Demo Data on the compact icon rail. A small panel shows the live
 * as-of date and sends Reset to Settings' confirmed ResetDialog, so the rail
 * neither duplicates the reset path nor a second `as-of-label`.
 */
export function RailDemoData() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const asOf = useAsOf();

  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="flex-none">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Demo data"
            aria-expanded={open}
            aria-controls="rail-demo-panel"
            onClick={() => setOpen((o) => !o)}
            className={`grid size-11 place-items-center rounded-xl border border-rail-glass-border text-rail-mint transition-colors duration-200 hover:bg-rail-glass-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-mint motion-reduce:transition-none ${
              open ? "bg-rail-glass-strong" : "bg-rail-glass"
            }`}
          >
            <Database className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Demo data</TooltipContent>
      </Tooltip>
      {open && (
        <div
          id="rail-demo-panel"
          role="group"
          aria-label="Demo data"
          className="fixed bottom-3 left-[80px] z-30 flex w-60 flex-col gap-2.5 rounded-[20px] border border-rail-glass-border bg-rail-surface p-4 text-rail-text shadow-lg"
        >
          <p className="text-[15px] font-semibold">Demo Data</p>
          <p className="text-[13px] leading-snug text-rail-secondary">Using synthetic data for product showcase.</p>
          <p className="flex w-fit items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-[12px] font-medium tabular-nums text-rail-nav-text">
            <CalendarDays className="size-3.5 text-rail-mint" aria-hidden="true" />
            As of {formatDate(asOf)}
          </p>
          <Link
            href="/settings#reset"
            onClick={close}
            className="mt-1 flex h-10 items-center justify-center gap-2 rounded-[14px] bg-rail-reset text-sm font-semibold text-rail-reset-text transition-colors hover:bg-rail-reset-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-mint active:bg-rail-reset-pressed"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset in Settings
          </Link>
        </div>
      )}
    </div>
  );
}
