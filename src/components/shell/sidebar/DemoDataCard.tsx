"use client";

import dynamic from "next/dynamic";
import { CalendarDays, Database } from "lucide-react";

import { AsOfLabel } from "@/components/shell/AsOfLabel";
import { Button } from "@/components/ui/button";

// TASK-40: the reset path (dataCommands → loader, csv) loads after the shell,
// not in every route's first load. Same label and size while it arrives.
const ResetDialog = dynamic(() => import("@/components/settings/ResetDialog").then((m) => m.ResetDialog), {
  loading: () => (
    <Button size="sm" variant="outline" disabled>
      Reset Demo
    </Button>
  ),
});

/*
 * Restyles the shared ResetDialog trigger (Settings owns it) as the pale-mint
 * "Reset Demo" button without forking the reset path. Descendant variants
 * (`.x button`, specificity 0,1,1) outrank the Button's own single-class
 * utilities. Not a CSS module: next.config's `*.css` Turbopack rule emits
 * `.module.css` files as global CSS, so module class names come back undefined.
 */
const RESET_BUTTON = [
  "[&_button]:h-11 [&_button]:w-full [&_button]:gap-2.5 [&_button]:rounded-[17px] [&_button]:border-transparent",
  "[&_button]:bg-rail-reset [&_button]:text-[15px] [&_button]:font-[650] [&_button]:text-rail-reset-text",
  "[&_button]:transition-[background-color,box-shadow] [&_button]:duration-180 motion-reduce:[&_button]:transition-none",
  "[&_button:hover:not(:disabled)]:bg-rail-reset-hover [&_button:hover:not(:disabled)]:shadow-[0_0_0_3px_rgb(142_215_176/0.18)]",
  "[&_button:active:not(:disabled)]:bg-rail-reset-pressed",
  "[&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-rail-mint",
  "[&_button]:before:size-[18px] [&_button]:before:flex-none [&_button]:before:bg-current [&_button]:before:content-['']",
  "[&_button]:before:[mask:var(--rail-reset-icon)_center/contain_no-repeat]",
  "[@media(min-height:880px)_and_(max-height:1159px)]:[&_button]:h-12",
  "[@media(min-height:1160px)]:[&_button]:h-[54px] [@media(min-height:1160px)]:[&_button]:text-[16px]",
  "[&_[role=status]]:text-[12px] [&_[role=status]]:text-rail-secondary",
].join(" ");

/**
 * TASK-38: the sidebar's Demo Data card. The as-of date is the live
 * `AsOfLabel` (the one `as-of-label` in the DOM) and Reset goes through the
 * shared, confirmed `ResetDialog` — no second reset path. Spacing steps with
 * the sidebar's height tiers; under 880px tall the description is dropped so
 * the card never crowds the nav.
 */
export function DemoDataCard() {
  return (
    <section
      aria-labelledby="demo-data-title"
      className="relative flex flex-col gap-2.5 rounded-[24px] border border-rail-glass-border bg-rail-glass p-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] [@media(min-height:1160px)]:gap-3 [@media(min-height:1160px)]:p-5"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 flex-none place-items-center rounded-full bg-gradient-to-br from-rail-bright to-rail-nav text-white ring-1 ring-rail-mint/30 [@media(min-height:1160px)]:size-11"
        >
          <Database className="size-[18px] [@media(min-height:1160px)]:size-5" strokeWidth={2} />
        </span>
        <p id="demo-data-title" className="text-[16px] font-semibold text-rail-text [@media(min-height:1160px)]:text-[18px]">
          Demo Data
        </p>
      </div>
      <p className="hidden text-[14px] leading-normal text-rail-secondary [@media(min-height:1160px)]:block [@media(min-height:1160px)]:text-[15px] [@media(min-height:880px)_and_(max-height:1159px)]:block">
        Using synthetic data for product showcase.
      </p>
      <div className="flex w-fit items-center gap-2 rounded-full bg-rail-glass-strong px-3 py-1.5 text-rail-mint">
        <CalendarDays className="size-4 flex-none" aria-hidden="true" />
        <AsOfLabel className="text-[13px] font-medium tabular-nums [@media(min-height:1160px)]:text-[14px]" />
      </div>
      <div className={`mt-0.5 ${RESET_BUTTON}`}>
        <ResetDialog label="Reset Demo" size="sm" />
      </div>
    </section>
  );
}
