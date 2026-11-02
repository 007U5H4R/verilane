import Link from "next/link";

import { LogoCard } from "@/components/shell/LogoCard";
import { NAV_ITEMS } from "@/components/shell/NavItems";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// TASK-20.1: the 768–1023px shell (Design.md §13) — the sidebar collapses to
// a 72px icon rail. Labels live in a tooltip and the link's `aria-label`;
// counts, workspace name and the as-of footer are dropped (mockup).
export function IconRail({ activeHref }: { activeHref: string }) {
  return (
    <aside
      aria-label="Primary"
      className="hidden w-[72px] flex-col items-center gap-4 overflow-y-auto bg-rail px-2 py-3 text-rail-text md:sticky md:top-0 md:flex md:h-dvh lg:hidden"
    >
      <LogoCard compact />
      <span
        aria-hidden="true"
        className="grid size-8 flex-none place-items-center rounded-full bg-rail-active text-xs font-semibold"
      >
        AR
      </span>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`grid size-11 place-items-center rounded-md text-rail-text hover:bg-white/5 ${
                    isActive ? "bg-rail-active" : ""
                  }`}
                >
                  <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
