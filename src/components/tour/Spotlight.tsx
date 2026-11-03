/**
 * TASK-44: finds the element a tour stage points at and rings it. Polls
 * (targets render late: live queries, lazy panels) and re-measures on
 * scroll and resize. The ring never takes pointer events, so the viewer
 * can always click what it points at.
 */
"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { findTarget } from "./findTarget";

export type Rect = { top: number; left: number; width: number; height: number };

const POLL_MS = 200;
const PAD = 6;

function same(a: Rect | null, b: Rect | null): boolean {
  return a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);
}

/** The target's viewport rect, or null while it isn't on screen. */
export function useTargetRect(selector: string, mobileFallback?: string): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let last: Element | null = null;
    let current: Rect | null = null;
    const measure = () => {
      const el = findTarget(selector, mobileFallback);
      if (el && el !== last) {
        // New target (first find, or re-rendered): bring it into view once.
        // A target taller than the screen (the ranked list) shows its top,
        // not its middle.
        const tall = el.getBoundingClientRect().height > window.innerHeight;
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: "auto" });
      }
      last = el;
      const r = el?.getBoundingClientRect();
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      if (!same(current, next)) {
        current = next;
        setRect(next);
      }
    };
    measure();
    const id = window.setInterval(measure, POLL_MS);
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [selector, mobileFallback]);

  return rect;
}

/** Dims the page around the target and draws a solid ring plus a dashed outline (a non-colour cue). */
export function SpotlightRing({ rect }: { rect: Rect }) {
  return (
    <div
      aria-hidden="true"
      data-testid="tour-spotlight"
      className={cn(
        "pointer-events-none fixed z-[60] rounded-lg",
        "outline-2 outline-offset-4 outline-dashed outline-brand",
        "transition-[top,left,width,height] duration-200 motion-reduce:transition-none",
      )}
      style={{
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        boxShadow: "0 0 0 3px var(--brand), 0 0 0 9999px rgb(8 20 15 / 0.55)",
      }}
    />
  );
}
