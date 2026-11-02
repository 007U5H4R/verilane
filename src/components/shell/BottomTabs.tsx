"use client";

import Link from "next/link";
import { useState } from "react";
import { Ellipsis } from "lucide-react";

import { MORE_HREFS, MoreSheet } from "@/components/shell/MoreSheet";
import { NAV_ITEMS } from "@/components/shell/NavItems";

const TAB_HREFS = ["/", "/queue", "/disputes"];
const TABS = NAV_ITEMS.filter((item) => TAB_HREFS.includes(item.href));

const TAB_CLASS =
  "flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-xs text-text-muted";
const ACTIVE_CLASS = "font-bold text-brand-strong";

// TASK-20.1: the <768px primary navigation (Design.md §13) — Home · Queue ·
// Disputes · More, 48px targets; More opens the sheet with every other route.
// Rendered after <main>, so tab order matches its place at the bottom.
export function BottomTabs({ activeHref }: { activeHref: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_HREFS.includes(activeHref);

  return (
    <>
      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`${TAB_CLASS} ${isActive ? ACTIVE_CLASS : ""}`}
            >
              <Icon className="size-5" strokeWidth={1.5} aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={`${TAB_CLASS} ${moreActive ? ACTIVE_CLASS : ""}`}
        >
          <Ellipsis className="size-5" strokeWidth={1.5} aria-hidden />
          More
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} activeHref={activeHref} />
    </>
  );
}
