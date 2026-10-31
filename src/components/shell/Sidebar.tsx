import Link from "next/link";

import { AsOfLabel } from "@/components/shell/AsOfLabel";
import { LogoCard } from "@/components/shell/LogoCard";
import { NAV_ITEMS } from "@/components/shell/NavItems";
import { QueueCount } from "@/components/shell/QueueCount";
import { RoleLabel } from "@/components/shell/RoleSwitcher";

// TASK-6.5: 216px emerald rail; active link is wired per-page via the
// `data-active` prop (server components can't read the pathname themselves).
export function Sidebar({ activeHref }: { activeHref: string }) {
  return (
    <aside
      aria-label="Primary"
      className="flex w-[216px] flex-col gap-4 bg-rail p-4 text-rail-text"
    >
      <LogoCard />
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-8 flex-none place-items-center rounded-full bg-rail-active text-xs font-semibold"
        >
          AR
        </span>
        <span>
          <b className="block">Demo workspace</b>
          <small className="block text-xs text-rail-muted">
            <RoleLabel />
          </small>
        </span>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-rail-text hover:bg-white/5 ${
                isActive ? "bg-rail-active font-semibold" : ""
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
              {item.liveCount && <QueueCount />}
              {item.count !== undefined && (
                <span className="ml-auto text-xs text-rail-muted">
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <span className="w-fit rounded-full border border-white/20 px-2.5 py-1 text-xs font-bold tracking-wider text-rail-muted">
          DEMO DATA
        </span>
        <AsOfLabel className="text-xs text-rail-muted" />
      </div>
    </aside>
  );
}
