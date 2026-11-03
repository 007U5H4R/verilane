"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ChevronDown, Settings } from "lucide-react";

import { RoleLabel } from "@/components/shell/RoleSwitcher";
import { useDismiss } from "@/components/shell/useDismiss";

/**
 * TASK-38: the sidebar's workspace card. There is one demo workspace, so the
 * dropdown shows what it is (synthetic data, current role) and links to
 * Settings — it never pretends to switch workspaces.
 */
export function WorkspaceCard() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="workspace-panel"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-[20px] border border-rail-glass-border bg-rail-glass px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] transition-colors duration-200 hover:border-rail-mint/35 hover:bg-rail-glass-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-mint active:bg-rail-glass motion-reduce:transition-none [@media(min-height:1160px)]:gap-4 [@media(min-height:1160px)]:p-4 [@media(min-height:880px)_and_(max-height:1159px)]:p-3"
      >
        <span
          aria-hidden="true"
          className="grid size-10 flex-none place-items-center rounded-full bg-rail-nav text-[15px] font-bold tracking-wide text-white ring-1 ring-rail-mint/30 [@media(min-height:1160px)]:size-14 [@media(min-height:1160px)]:text-[19px] [@media(min-height:880px)_and_(max-height:1159px)]:size-[46px] [@media(min-height:880px)_and_(max-height:1159px)]:text-base"
        >
          AR
        </span>
        <span className="min-w-0 flex-1">
          <b title="Demo Workspace" className="block truncate text-[15px] font-semibold text-rail-text [@media(min-height:1160px)]:text-[17px]">
            Demo Workspace
          </b>
          <small className="block truncate text-[13px] text-rail-mint/80 [@media(min-height:1160px)]:text-[15px]">
            <RoleLabel />
          </small>
        </span>
        <ChevronDown
          className={`size-5 flex-none text-rail-mint transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id="workspace-panel"
          className="absolute inset-x-0 top-full z-20 mt-2 flex flex-col gap-1.5 rounded-2xl border border-rail-divider bg-rail-surface p-3.5 text-sm text-rail-text shadow-lg"
        >
          <p className="font-semibold">Demo Workspace</p>
          <p className="text-xs text-rail-secondary">Synthetic accounts-receivable data stored in this browser.</p>
          <p className="text-xs text-rail-secondary">
            Signed in as <RoleLabel />
          </p>
          <hr className="my-1 border-rail-divider" />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-medium text-rail-mint transition-colors hover:bg-rail-glass-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-mint"
          >
            <Settings className="size-4" aria-hidden="true" />
            Workspace settings
          </Link>
        </div>
      )}
    </div>
  );
}
