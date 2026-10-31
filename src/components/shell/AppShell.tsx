"use client";

import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { NAV_ITEMS } from "@/components/shell/NavItems";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = NAV_ITEMS.find((item) => item.href === pathname);
  const crumb = active?.label ?? "Home";

  return (
    <div className="grid min-h-full grid-cols-[216px_minmax(0,1fr)]">
      <Sidebar activeHref={active?.href ?? "/"} />
      <div className="flex min-w-0 flex-col">
        <TopBar crumb={crumb} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
