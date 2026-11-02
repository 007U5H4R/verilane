"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Database } from "lucide-react";

import { AsOfLabel } from "@/components/shell/AsOfLabel";
import { LogoCard } from "@/components/shell/LogoCard";
import { DisputeCount } from "@/components/shell/DisputeCount";
import { DraftCount } from "@/components/shell/DraftCount";
import { NAV_ITEMS } from "@/components/shell/NavItems";
import { QueueCount } from "@/components/shell/QueueCount";
import { WorkspaceCard } from "@/components/shell/WorkspaceCard";
import { ResetDialog } from "@/components/settings/ResetDialog";

// TASK-38 (Design.md R2): 250px dark-emerald rail — logo + descriptor,
// workspace card, primary nav, a divider, secondary nav, then the Demo Data
// card. The active link is passed in by AppShell.
export function Sidebar({ activeHref }: { activeHref: string }) {
  return (
    <aside
      aria-label="Primary"
      className="hidden w-[250px] flex-col gap-5 overflow-y-auto bg-rail px-4 py-5 text-rail-text lg:sticky lg:top-0 lg:flex lg:h-dvh"
    >
      <div className="flex flex-col gap-2">
        <LogoCard />
        <p className="text-center text-[11px] font-medium tracking-wide text-rail-muted">AR Collections Copilot</p>
      </div>
      <WorkspaceCard />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item, i) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          const firstSecondary = item.secondary && !NAV_ITEMS[i - 1]?.secondary;
          return (
            <Fragment key={item.href}>
              {firstSecondary && <hr className="my-2 border-rail-border" />}
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-text ${
                  isActive ? "bg-rail-active font-semibold text-rail-text" : "text-rail-text/85"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {item.liveCount && <QueueCount />}
                {item.disputeCount && <DisputeCount />}
                {item.draftCount && <DraftCount />}
              </Link>
            </Fragment>
          );
        })}
      </nav>
      <section
        aria-label="Demo data"
        className="mt-auto flex flex-col gap-2 rounded-xl border border-rail-border bg-white/5 p-3"
      >
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Database className="size-4" aria-hidden="true" />
          Demo Data
        </p>
        <p className="text-xs text-rail-muted">Using synthetic data for product showcase.</p>
        <AsOfLabel className="text-xs text-rail-muted" />
        <div className="[&_button]:w-full [&_button]:border-rail-border [&_button]:bg-transparent [&_button]:text-rail-text [&_button:hover]:bg-white/10 [&_[role=status]]:text-rail-muted">
          <ResetDialog label="Reset Demo" size="sm" />
        </div>
      </section>
    </aside>
  );
}
