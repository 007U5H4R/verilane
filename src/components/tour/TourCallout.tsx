/**
 * TASK-44: the tour's narrator card. A non-modal dialog: the viewer must be
 * able to reach the element it points at, so it never traps focus. A floating
 * card beside the target at ≥768px; a bottom sheet below that.
 */
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Rect } from "./Spotlight";

const WIDTH = 360;
const GAP = 16;
const EDGE = 12;

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

/** Phone: dock the sheet to the bottom tabs' measured top (their height comes from their content). */
function dock(): React.CSSProperties {
  const tabs = document.querySelector("[data-tour=nav-more]")?.closest("nav");
  return tabs ? { bottom: window.innerHeight - tabs.getBoundingClientRect().top } : {};
}

/** Below the target if it fits, else above, else the bottom-right corner. */
function place(rect: Rect | null, height: number): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { right: EDGE * 2, bottom: EDGE * 2 };
  const left = Math.min(Math.max(EDGE, rect.left), vw - WIDTH - EDGE);
  const below = rect.top + rect.height + GAP;
  if (below + height <= vh - EDGE) return { top: below, left };
  const above = rect.top - GAP - height;
  if (above >= EDGE) return { top: above, left };
  return { right: EDGE * 2, bottom: EDGE * 2 };
}

export type TourCalloutProps = {
  stepIndex: number;
  stepCount: number;
  title: string;
  pitch: string;
  prompt: string;
  rect: Rect | null;
  /** Changes whenever focus should move back to the heading (step or substage). */
  focusKey: string;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function TourCallout(props: TourCalloutProps) {
  const { stepIndex, stepCount, title, pitch, prompt, rect, focusKey, isLast, onNext, onBack, onSkip } = props;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [focusKey]);

  useLayoutEffect(() => {
    setStyle(desktop ? place(rect, card.current?.offsetHeight ?? 220) : dock());
  }, [desktop, rect, focusKey]);

  return (
    <div
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      data-testid="tour-callout"
      data-tour-callout=""
      data-tour-ui=""
      style={style}
      className={cn(
        "fixed z-[70] border border-border bg-surface p-4 text-text shadow-xl",
        "transition-[top,left] duration-200 motion-reduce:transition-none",
        // <768: a bottom sheet above the bottom tabs (docked by dock(); the class is the fallback); never wider than the screen.
        "inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] max-w-[100vw] rounded-t-2xl",
        "md:inset-x-auto md:bottom-auto md:w-[360px] md:rounded-xl md:pb-4",
      )}
    >
      <p className="text-xs font-medium text-text-muted">
        Step {stepIndex + 1} of {stepCount}
      </p>
      <h2 id={headingId} ref={heading} tabIndex={-1} className="mt-0.5 text-base font-semibold outline-none">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text">{pitch}</p>
      <p data-testid="tour-prompt" className="mt-3 rounded-md bg-surface-sunken px-3 py-2 text-sm font-medium">
        <span aria-hidden="true">👉 </span>
        {prompt}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip tour
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack} disabled={stepIndex === 0}>
            Back
          </Button>
          <Button size="sm" onClick={onNext}>
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
