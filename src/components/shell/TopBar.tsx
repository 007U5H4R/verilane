import { lazy, Suspense } from "react";

import type { Crumb } from "@/components/shell/breadcrumb";
import { InstallChip } from "@/components/shell/InstallChip";
import { LlmStatusBadge } from "@/components/shell/LlmStatusBadge";
import { RoleSwitcher } from "@/components/shell/RoleSwitcher";
import { DemoButton } from "@/components/tour/DemoButton";
import { Breadcrumb } from "@/components/shell/topbar/Breadcrumb";
import { GuestSlot } from "@/components/shell/topbar/GuestSlot";
import { SidebarToggle } from "@/components/shell/topbar/SidebarToggle";
import type { SidebarState } from "@/components/shell/topbar/useSidebarState";

// TC-083 route budget: the search and the theme/bell/account cluster load as
// their own chunks, still server-rendered (React.lazy — next/dynamic adds its
// own runtime to first load). Until one arrives its slot keeps its space,
// empty — no stand-in control.
const GlobalSearch = lazy(() => import("@/components/shell/GlobalSearch").then((m) => ({ default: m.GlobalSearch })));
const TopBarActions = lazy(() => import("@/components/shell/topbar/TopBarActions"));

function Divider() {
  return <span aria-hidden className="hidden h-8 w-px shrink-0 bg-topbar-divider xl:block" />;
}

// TASK-38: sticky premium top bar. DOM order is visual order (TC-064):
// toggle · breadcrumb · search · guest (TASK-39) · LLM · role · theme · bell · avatar.
// ≥1280 one 76px row with an inline search field; 768–1279 the search is an
// icon that opens a full-width row under the bar; <768 two rows — menu,
// current page, demo pill and search, then the controls.
export function TopBar({
  crumbs,
  sidebar,
  onToggleSidebar,
  activeHref,
}: {
  crumbs: Crumb[];
  sidebar: SidebarState;
  onToggleSidebar: () => void;
  activeHref: string;
}) {
  return (
    <header className="topbar-wave sticky top-0 z-20 isolate flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-topbar-divider bg-topbar px-3 py-2.5 backdrop-blur-md md:h-[68px] md:flex-nowrap md:gap-x-3 md:px-6 md:py-0 lg:h-[76px] lg:px-7">
      <SidebarToggle sidebar={sidebar} onToggle={onToggleSidebar} activeHref={activeHref} />
      <Breadcrumb crumbs={crumbs} />
      <span className="shrink-0 rounded-full border border-topbar-control-border bg-surface px-2 py-0.5 text-[11px] font-semibold tracking-wide text-text-muted md:hidden">
        DEMO DATA
      </span>
      <Suspense fallback={<span aria-hidden className="size-11 shrink-0 xl:h-12 xl:min-w-[220px] xl:flex-1" />}>
        <GlobalSearch />
      </Suspense>
      <Divider />
      <div className="flex basis-full items-center justify-between gap-2 md:ml-auto md:basis-auto md:justify-end md:gap-3 xl:ml-0">
        <div className="flex items-center gap-1.5 md:gap-3">
          <GuestSlot />
          <LlmStatusBadge />
          <InstallChip />
          <DemoButton />
          <RoleSwitcher />
        </div>
        <Divider />
        <Suspense fallback={<span aria-hidden className="h-11 w-[136px] shrink-0 md:w-[148px]" />}>
          <TopBarActions />
        </Suspense>
      </div>
    </header>
  );
}
