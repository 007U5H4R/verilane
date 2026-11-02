"use client";

import { useLayoutEffect, type KeyboardEvent, type RefObject } from "react";

import { cn } from "@/lib/cn";
import type { RowAction } from "./queueActions";

export type Pos = { top?: number; bottom?: number; right: number };

/**
 * The open list of a RowMenu, split out so it loads on first use. On mount it
 * focuses the first (or last) item; ↑/↓ move, Home/End jump, Escape closes
 * and refocuses the trigger, Tab closes.
 */
export function RowMenuList({
  menuRef,
  id,
  label,
  pos,
  startAt,
  actions,
  onClose,
  onReminder,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  id: string;
  label: string;
  pos: Pos;
  startAt: "first" | "last";
  actions: RowAction[];
  onClose: (refocus: boolean) => void;
  onReminder: () => void;
}) {
  const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useLayoutEffect(() => {
    const list = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    (startAt === "first" ? list[0] : list[list.length - 1])?.focus();
    // Focus once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowDown") next = list[(i + 1) % list.length];
    else if (e.key === "ArrowUp") next = list[(i - 1 + list.length) % list.length];
    else if (e.key === "Home") next = list[0];
    else if (e.key === "End") next = list[list.length - 1];
    else if (e.key === "Escape") {
      e.preventDefault();
      onClose(true);
      return;
    } else if (e.key === "Tab") {
      onClose(false);
      return;
    }
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  const item =
    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-text outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken";

  return (
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={`Actions for ${label}`}
      onKeyDown={onKey}
      style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}
      className="fixed z-40 flex w-56 flex-col gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-card"
    >
      {actions.map((a) =>
        a.kind === "reminder" ? (
          <button
            key={a.kind}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={cn(item, "font-medium text-brand-strong")}
            onClick={() => {
              onClose(true);
              onReminder();
            }}
          >
            {a.label}
          </button>
        ) : (
          <a key={a.kind} role="menuitem" tabIndex={-1} href={a.href} className={item}>
            {a.label}
          </a>
        ),
      )}
    </div>
  );
}
