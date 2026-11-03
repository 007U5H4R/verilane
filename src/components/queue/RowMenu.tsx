"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { Ellipsis } from "lucide-react";

import type { RowAction } from "./queueActions";
import type { Pos } from "./RowMenuList";

// The open list loads on first use (keeps /queue under its first-load budget).
const RowMenuList = dynamic(() => import("./RowMenuList").then((m) => m.RowMenuList), { ssr: false });

/**
 * The row's "⋯" menu (TASK-38): a menu button with only the actions the
 * data supports for that row (`rowActions`). Keyboard: Enter/Space/↓ opens
 * on the first item, ↑ on the last; ↑/↓ move, Home/End jump, Escape or Tab
 * close and focus returns to the trigger. The list is `position: fixed` so
 * the table's horizontal-scroll wrapper never clips it.
 */
export function RowMenu({
  label,
  actions,
  onReminder,
}: {
  /** Invoice number (or id) — names the trigger "Actions for …". */
  label: string;
  actions: RowAction[];
  onReminder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [startAt, setStartAt] = useState<"first" | "last">("first");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  function show(at: "first" | "last") {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    // Open upward when the lower part of the viewport can't fit the list.
    setPos(window.innerHeight - r.bottom < 200 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
    setStartAt(at);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false);
    };
    // A fixed list would drift from its row on scroll/resize; close instead.
    const onMove = () => close(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close]);

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show(e.key === "ArrowDown" ? "first" : "last");
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : show("first"))}
        onKeyDown={onTriggerKey}
        className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
      >
        <Ellipsis aria-hidden className="size-4" />
      </button>
      {open && pos && (
        <RowMenuList
          menuRef={menuRef}
          id={menuId}
          label={label}
          pos={pos}
          startAt={startAt}
          actions={actions}
          onClose={close}
          onReminder={onReminder}
        />
      )}
    </>
  );
}
