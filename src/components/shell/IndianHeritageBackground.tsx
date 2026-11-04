"use client";

import { usePathname } from "next/navigation";

import { heritageLevelFor, isHeritageHome } from "@/lib/heritage";

// TASK-46 (Design.md R3): the decorative heritage band behind the AppShell
// column. It is pure CSS: the art is a `background-image` on [data-heritage]
// (globals.css, "TASK-46 heritage" block) and the theme is picked off
// <html data-theme>, so it never becomes an LCP candidate, owns no layout box
// (absolute, behind content) and swaps theme without JS.
// TASK-46.3: `data-level` comes from the route table (src/lib/heritage.ts);
// `data-home` lets the <768px rule show the strip on Home only.
export function IndianHeritageBackground() {
  const pathname = usePathname();
  return (
    <div
      aria-hidden="true"
      data-heritage=""
      data-level={heritageLevelFor(pathname)}
      data-home={isHeritageHome(pathname) ? "" : undefined}
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 select-none"
    >
      <span data-heritage-preload="" />
    </div>
  );
}
