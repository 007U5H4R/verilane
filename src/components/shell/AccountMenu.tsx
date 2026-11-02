"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { RoleLabel } from "@/components/shell/RoleSwitcher";
import { useDismiss } from "@/components/shell/useDismiss";

/**
 * TASK-38: the top-bar avatar. The demo has no sign-in, so the panel says
 * so plainly — current role and a Settings link, no fake profile or logout.
 */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-controls="account-panel"
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full bg-rail-active text-xs font-semibold text-rail-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
      >
        AR
      </button>
      {open && (
        <div
          id="account-panel"
          className="absolute top-full right-0 z-30 mt-1.5 flex w-64 flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg"
        >
          <p className="font-semibold">Demo Workspace</p>
          <p className="text-xs text-text-muted">
            Acting as <RoleLabel />. This demo has no sign-in; switch roles with the Analyst / Manager control.
          </p>
          <hr className="my-1 border-border" />
          <Link href="/settings" onClick={close} className="rounded-md px-2 py-1.5 text-interactive hover:bg-surface-sunken">
            Settings
          </Link>
        </div>
      )}
    </div>
  );
}
