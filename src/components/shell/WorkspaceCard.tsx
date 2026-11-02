"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { RoleLabel } from "@/components/shell/RoleSwitcher";
import { useDismiss } from "@/components/shell/useDismiss";

/**
 * TASK-38: the sidebar's workspace card. There is one demo workspace, so the
 * dropdown shows what it is (synthetic data, as-of date, current role) and
 * links to Settings — it never pretends to switch workspaces.
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
        className="flex w-full items-center gap-3 rounded-xl border border-rail-border bg-white/5 p-2.5 text-left hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-text"
      >
        <span
          aria-hidden="true"
          className="grid size-9 flex-none place-items-center rounded-full bg-rail-active text-xs font-semibold"
        >
          AR
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">Demo Workspace</b>
          <small className="block text-xs text-rail-muted">
            <RoleLabel />
          </small>
        </span>
        <ChevronDown className={`size-4 text-rail-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id="workspace-panel"
          className="absolute inset-x-0 top-full z-20 mt-1.5 flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 text-sm text-text shadow-lg"
        >
          <p className="font-semibold">Demo Workspace</p>
          <p className="text-xs text-text-muted">Synthetic accounts-receivable data stored in this browser.</p>
          <p className="text-xs text-text-muted">
            Signed in as <RoleLabel />
          </p>
          <hr className="my-1 border-border" />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-1.5 text-interactive hover:bg-surface-sunken"
          >
            Workspace settings
          </Link>
        </div>
      )}
    </div>
  );
}
