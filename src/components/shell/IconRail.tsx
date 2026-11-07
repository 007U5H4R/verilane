"use client";

import Link from "next/link";

import { DisputeCount } from "@/components/shell/DisputeCount";
import { ExceptionCount } from "@/components/shell/ExceptionCount";
import { DraftCount } from "@/components/shell/DraftCount";
import { LogoCard } from "@/components/shell/LogoCard";
import { NAV_ITEMS } from "@/components/shell/NavItems";
import { QueueCount } from "@/components/shell/QueueCount";
import { RailDemoData } from "@/components/shell/sidebar/RailDemoData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { navTourId } from "@/components/tour/navTarget";

// TASK-20.1 / TASK-38: the 72px compact rail — 768–1023px, and on desktop
// when AppShell's toggle collapses the sidebar. Labels live in a tooltip and
// the link's `aria-label`; live counts show as corner badges (the link's
// description); Demo Data opens a small panel at the foot.
export function IconRail({ activeHref }: { activeHref: string }) {
  return (
    <aside
      aria-label="Primary"
      className="hidden w-[72px] flex-col items-center gap-4 overflow-y-auto bg-gradient-to-b from-rail-deep to-rail-surface px-2 py-4 text-rail-text [scrollbar-width:none] md:sticky md:top-0 md:flex md:h-dvh lg:hidden lg:group-data-[sidebar=collapsed]/shell:flex"
    >
      <LogoCard variant="mark" />
      <span
        aria-hidden="true"
        className="grid size-9 flex-none place-items-center rounded-full bg-gradient-to-br from-rail-nav-hover to-rail-nav text-xs font-bold text-white ring-1 ring-rail-mint/25"
      >
        AR
      </span>
      <nav aria-label="Main" className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map((item, i) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          const firstSecondary = item.secondary && !NAV_ITEMS[i - 1]?.secondary;
          const countId = `rail-count-${item.href.slice(1) || "home"}`;
          const hasCount = item.liveCount || item.disputeCount || item.draftCount || item.exceptionCount;
          return (
            <div key={item.href} className="flex flex-col items-center">
              {firstSecondary && <hr aria-hidden="true" className="my-1.5 w-8 border-rail-divider" />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    data-tour={navTourId(item.href)}
                    aria-label={item.label}
                    aria-describedby={hasCount ? countId : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative grid size-11 place-items-center rounded-xl border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-mint motion-reduce:transition-none ${
                      isActive
                        ? "border-rail-mint/30 bg-rail-nav text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-rail-nav-hover"
                        : "border-transparent text-rail-secondary hover:bg-rail-glass-strong hover:text-white"
                    }`}
                  >
                    <Icon className="size-5" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
                    {item.liveCount && <QueueCount compact id={countId} />}
                    {item.disputeCount && <DisputeCount compact id={countId} />}
                    {item.exceptionCount && <ExceptionCount compact id={countId} />}
                    {item.draftCount && <DraftCount compact id={countId} />}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto pt-2">
        <RailDemoData />
      </div>
    </aside>
  );
}
