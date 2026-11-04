"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { heritageLevelFor, isHeritageHome, scheduleIdleOnce } from "@/lib/heritage";

// TASK-46 (Design.md R3): the decorative heritage band behind the AppShell
// column. It is pure CSS: the art is a `background-image` on [data-heritage]
// (globals.css, "TASK-46 heritage" block) and the theme is picked off
// <html data-theme>, so it never becomes an LCP candidate, owns no layout box
// (absolute, behind content) and swaps theme without JS.
// TASK-46.3: `data-level` comes from the route table (src/lib/heritage.ts);
// `data-home` lets the <768px rule show the strip on Home only.
// TASK-46.4: once the page is idle, `data-idle` gives the preload span the
// other theme's image (CSS), so the first toggle swaps from cache (F4). Not on
// `off`, not under Save-Data (scheduleIdleOnce); the effect cancels on unmount.
// The layer outlives client navigations, so `idle` from a normal route is
// gated on `!off` too: an off route never carries data-idle (R-1, TC-103b).
export function IndianHeritageBackground() {
  const pathname = usePathname();
  const level = heritageLevelFor(pathname);
  const off = level === "off";
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (off) return;
    return scheduleIdleOnce(window, () => setIdle(true));
  }, [off]);
  return (
    <div
      aria-hidden="true"
      data-heritage=""
      data-level={level}
      data-home={isHeritageHome(pathname) ? "" : undefined}
      data-idle={idle && !off ? "" : undefined}
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 select-none"
    >
      <span data-heritage-preload="" />
    </div>
  );
}
