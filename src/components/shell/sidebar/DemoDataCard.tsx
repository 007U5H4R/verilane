"use client";

import { CalendarDays, Database } from "lucide-react";

import { AsOfLabel } from "@/components/shell/AsOfLabel";
import { ResetDialog } from "@/components/settings/ResetDialog";

import styles from "./DemoDataCard.module.css";

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
      <div className={`mt-0.5 ${styles.reset}`}>
        <ResetDialog label="Reset Demo" size="sm" />
      </div>
    </section>
  );
}
