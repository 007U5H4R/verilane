"use client";

import { usePathname } from "next/navigation";

import { BannerHost } from "@/components/shell/Banner";
import { BottomTabs } from "@/components/shell/BottomTabs";
import { IconRail } from "@/components/shell/IconRail";
import { LogoCard } from "@/components/shell/LogoCard";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { crumbsFor } from "@/components/shell/breadcrumb";
import { NAV_ITEMS } from "@/components/shell/NavItems";
import { SeedUpdatePrompt } from "@/components/SeedUpdatePrompt";
import { useOnline } from "@/lib/useOnline";

// TASK-20 (Design.md §13): ≥1024 216px sidebar · 768–1023 72px icon rail ·
// <768 a rail-coloured top strip + fixed bottom tabs. DOM order is visual
// order (20.4): nav column, top bar, banners, main, then the bottom tabs.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = NAV_ITEMS.find((item) => item.href === pathname);
  const activeHref = active?.href ?? "/";
  const online = useOnline();

  return (
    <div className="grid min-h-full grid-cols-1 md:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[216px_minmax(0,1fr)]">
      <Sidebar activeHref={activeHref} />
      <IconRail activeHref={activeHref} />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 bg-rail px-4 py-2.5 md:hidden">
          <div className="w-[104px]">
            <LogoCard compact />
          </div>
          <span className="rounded-full border border-white/25 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-rail-text">
            DEMO DATA
          </span>
        </div>
        <TopBar crumbs={crumbsFor(pathname)} />
        <BannerHost offline={!online} />
        <SeedUpdatePrompt />
        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
      </div>
      <BottomTabs activeHref={activeHref} />
    </div>
  );
}
