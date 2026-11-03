/**
 * TASK-44: the always-visible top-bar entry to the demo tour. It only asks
 * for the tour (the confirm dialog lives in the lazily loaded TourHost), so
 * it stays tiny on every route's first load.
 */
"use client";

import { PlayCircle } from "lucide-react";

import { requestTour, useTour } from "./tourStore";

export function DemoButton() {
  const running = useTour().phase !== "idle";
  return (
    <button
      type="button"
      data-testid="demo-button"
      aria-pressed={running}
      onClick={requestTour}
      title="Demo tour"
      className={`inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-topbar-control-border px-2.5 text-[14px] font-medium shadow-[0_1px_2px_rgb(8_47_37/0.05)] transition-colors duration-200 motion-reduce:transition-none 2xl:px-4 md:text-[15px] ${
        running ? "bg-brand text-on-brand" : "bg-surface text-text hover:bg-surface-sunken"
      }`}
    >
      <PlayCircle className="size-5" strokeWidth={1.5} aria-hidden />
      {/* TASK-49: like the LLM badge, the label shows only where the bar has
          room (>=1536); below that it stays in the accessibility tree. */}
      <span className="sr-only 2xl:not-sr-only">Demo</span>
    </button>
  );
}
