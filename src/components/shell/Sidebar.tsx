"use client";

import Link from "next/link";
import { Fragment } from "react";

import { LogoCard } from "@/components/shell/LogoCard";
import { DisputeCount } from "@/components/shell/DisputeCount";
import { DraftCount } from "@/components/shell/DraftCount";
import { NAV_ITEMS } from "@/components/shell/NavItems";
import { QueueCount } from "@/components/shell/QueueCount";
import { WorkspaceCard } from "@/components/shell/WorkspaceCard";
import { DemoDataCard } from "@/components/shell/sidebar/DemoDataCard";
import { SidebarWaves } from "@/components/shell/sidebar/SidebarWaves";

// TASK-38 V2 (premium sidebar): 272px dark-emerald rail — brand link, workspace
// card, primary nav, a divider, secondary nav, then the Demo Data card over
// layered waves. Brand and Demo Data stay put; only the nav scrolls, so the
// card can never overlap Settings. Spacing steps through three height tiers:
// base (<880px tall), mid (≥880px, fits 1440×900) and tall (≥1160px, the
// reference's full sizes). The active link is router-derived (AppShell).
// Hidden when AppShell's desktop toggle collapses the shell to the IconRail.

export function Sidebar({ activeHref }: { activeHref: string }) {
  return (
    <aside
      aria-label="Primary"
      className="relative hidden w-[272px] flex-col overflow-hidden bg-gradient-to-b from-rail-deep to-rail-dark text-rail-text lg:sticky lg:top-0 lg:flex lg:h-dvh lg:group-data-[sidebar=collapsed]/shell:hidden"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_50%_0%,rgb(33_132_95/0.18),transparent_70%)]"
      />
      <SidebarWaves />
      <div className="relative flex flex-none flex-col px-4 pt-3.5 [@media(min-height:1160px)]:pt-8 [@media(min-height:880px)_and_(max-height:1159px)]:pt-5">
        <Link
          href="/"
          aria-label="Verilane home"
          className="mx-auto block w-[180px] rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rail-mint [@media(min-height:1160px)]:w-[220px] [@media(min-height:880px)_and_(max-height:1159px)]:w-[200px]"
        >
          <LogoCard />
        </Link>
        <p className="mt-2 flex items-center gap-3 text-[13px] font-medium tracking-[0.2px] text-rail-secondary [@media(min-height:1160px)]:mt-5 [@media(min-height:1160px)]:text-[15px] [@media(min-height:880px)_and_(max-height:1159px)]:mt-3 [@media(min-height:880px)_and_(max-height:1159px)]:text-[14px]">
          <span aria-hidden="true" className="h-px flex-1 bg-rail-mint/35" />
          AR Collections Copilot
          <span aria-hidden="true" className="h-px flex-1 bg-rail-mint/35" />
        </p>
        <div className="mt-2.5 [@media(min-height:1160px)]:mt-7 [@media(min-height:880px)_and_(max-height:1159px)]:mt-4">
          <WorkspaceCard />
        </div>
      </div>
      <nav
        aria-label="Main"
        className="relative mt-2.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-1 [scrollbar-width:thin] [@media(min-height:1160px)]:mt-6 [@media(min-height:1160px)]:gap-1.5 [@media(min-height:880px)_and_(max-height:1159px)]:mt-3.5"
      >
        {NAV_ITEMS.map((item, i) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          const firstSecondary = item.secondary && !NAV_ITEMS[i - 1]?.secondary;
          return (
            <Fragment key={item.href}>
              {firstSecondary && (
                <hr className="mx-3 my-1.5 flex-none border-rail-divider [@media(min-height:1160px)]:my-4 [@media(min-height:880px)_and_(max-height:1159px)]:my-2" />
              )}
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-[42px] w-full flex-none items-center gap-4 rounded-[18px] border px-4 text-[15px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-mint motion-reduce:transition-none [@media(min-height:1160px)]:h-[54px] [@media(min-height:1160px)]:rounded-[20px] [@media(min-height:1160px)]:text-[16px] [@media(min-height:880px)_and_(max-height:1159px)]:h-[44px] ${
                  isActive
                    ? "border-rail-mint/45 bg-gradient-to-r from-rail-bright to-rail-nav font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_6px_18px_-8px_rgb(33_132_95/0.7)] hover:from-rail-nav-hover"
                    : "border-transparent font-medium text-rail-text hover:bg-rail-glass-strong hover:text-white active:bg-rail-glass"
                }`}
              >
                <Icon
                  className={`size-[22px] shrink-0 [@media(min-height:1160px)]:size-6 ${isActive ? "text-white" : "text-rail-nav-text"}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.liveCount && <QueueCount active={isActive} />}
                {item.disputeCount && <DisputeCount active={isActive} />}
                {item.draftCount && <DraftCount active={isActive} />}
              </Link>
            </Fragment>
          );
        })}
      </nav>
      <div className="relative flex-none px-4 pb-3 pt-2.5 [@media(min-height:1160px)]:pb-14 [@media(min-height:1160px)]:pt-5 [@media(min-height:880px)_and_(max-height:1159px)]:pb-4 [@media(min-height:880px)_and_(max-height:1159px)]:pt-3">
        <DemoDataCard />
      </div>
    </aside>
  );
}
