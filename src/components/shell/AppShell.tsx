"use client";

import { usePathname } from "next/navigation";

import { BannerHost } from "@/components/shell/Banner";
import { BottomTabs } from "@/components/shell/BottomTabs";
import { IconRail } from "@/components/shell/IconRail";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { crumbsFor, navHrefFor } from "@/components/shell/breadcrumb";
import { useSidebarState } from "@/components/shell/topbar/useSidebarState";
import { SeedUpdatePrompt } from "@/components/SeedUpdatePrompt";
import { useOnline } from "@/lib/useOnline";

// TASK-20 (Design.md §13): ≥1024 216px sidebar · 768–1023 72px icon rail ·
// <768 fixed bottom tabs. DOM order is visual order (20.4): nav column, top
// bar, banners, main, then the bottom tabs.
// TASK-38: ≥1024 the sidebar is 272px expanded / 72px collapsed. AppShell
// owns that one state and exposes it as `data-sidebar` on the `group/shell`
// root, so the sidebar and rail style off it; the top bar's toggle flips it.
// <768 the old logo strip is gone — the top bar carries the menu button and
// the DEMO DATA pill.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navHref = navHrefFor(pathname);
  const activeHref = navHref ?? "/";
  const online = useOnline();
  const [sidebar, toggleSidebar] = useSidebarState();

  return (
    <div
      data-sidebar={sidebar}
      className="group/shell grid min-h-full transition-[grid-template-columns] duration-200 grid-cols-1 md:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)] lg:data-[sidebar=collapsed]:grid-cols-[72px_minmax(0,1fr)]"
    >
      <Sidebar activeHref={activeHref} />
      <IconRail activeHref={activeHref} />
      <div className="flex min-w-0 flex-col">
        <TopBar
          crumbs={crumbsFor(pathname)}
          sidebar={sidebar}
          onToggleSidebar={toggleSidebar}
          // An unknown route claims no current page inside the header (T34-5).
          activeHref={navHref ?? ""}
        />
        <BannerHost offline={!online} />
        <SeedUpdatePrompt />
        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
      </div>
      <BottomTabs activeHref={activeHref} />
    </div>
  );
}
