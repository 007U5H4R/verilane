"use client";

import { useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { MoreSheet } from "@/components/shell/MoreSheet";
import type { SidebarState } from "@/components/shell/topbar/useSidebarState";

const BTN =
  "size-11 shrink-0 place-items-center rounded-xl border border-topbar-control-border bg-surface text-text shadow-[0_1px_2px_rgb(8_47_37/0.05)] transition-colors duration-150 hover:bg-mint-pale";

/**
 * TASK-38: the top bar's leading control. ≥1024 it collapses/expands the
 * sidebar (one state, owned by AppShell); <768 it opens the full nav as a
 * sheet; 768–1023 the icon rail is always shown, so there is nothing to
 * toggle and it is hidden.
 */
export function SidebarToggle({
  sidebar,
  onToggle,
  activeHref,
}: {
  sidebar: SidebarState;
  onToggle: () => void;
  activeHref: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const collapsed = sidebar === "collapsed";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <>
      <button
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        onClick={onToggle}
        className={`hidden lg:grid ${BTN}`}
      >
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
        className={`grid md:hidden ${BTN}`}
      >
        <Menu className="size-5" strokeWidth={1.75} aria-hidden />
      </button>
      <MoreSheet variant="menu" open={menuOpen} onClose={() => setMenuOpen(false)} activeHref={activeHref} />
    </>
  );
}
