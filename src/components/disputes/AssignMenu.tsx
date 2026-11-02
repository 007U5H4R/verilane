"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DISPUTE_TEAM, type DisputeReviewer } from "@/domain/disputes/model";
import { cn } from "@/lib/cn";

type Choice = { value: DisputeReviewer | null; label: string };
const CHOICES: Choice[] = [...DISPUTE_TEAM.map((n) => ({ value: n, label: n })), { value: null, label: "Unassign" }];

/**
 * Owner picker (TASK-38): the fixed synthetic dispute team plus "Unassign".
 * A menu button — Enter/Space/ArrowDown opens it, arrows move, Esc closes
 * and returns focus. A choice that would change nothing is disabled, so
 * every enabled item does something.
 */
export function AssignMenu({
  current,
  disabled,
  disabledReason,
  onAssign,
  label,
  buttonText = "Assign",
  allowUnassign = true,
  align = "end",
}: {
  /** Current owner, or undefined/null when unassigned (multi-select: undefined). */
  current: string | null | undefined;
  disabled?: boolean;
  disabledReason?: string;
  onAssign: (reviewer: DisputeReviewer | null) => void;
  label: string;
  buttonText?: string;
  allowUnassign?: boolean;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const choices = allowUnassign ? CHOICES : CHOICES.filter((c) => c.value !== null);
  const isNoop = (c: Choice) => (c.value === null ? current === null : c.value === current);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={disabled ? disabledReason : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <UserRound aria-hidden className="size-3.5" />
        {buttonText}
        <ChevronDown aria-hidden className="size-3.5" />
      </Button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            "absolute top-full z-30 mt-1 flex min-w-44 flex-col rounded-lg border border-border bg-surface p-1 shadow-card",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {choices.map((c) => {
            const noop = isNoop(c);
            return (
              <button
                key={c.label}
                type="button"
                role="menuitem"
                disabled={noop}
                onClick={() => {
                  close(true);
                  onAssign(c.value);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-text outline-none",
                  "hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand",
                  "disabled:cursor-not-allowed disabled:text-text-muted",
                  c.value === null && "border-t border-border",
                )}
              >
                {c.label}
                {noop && <span className="text-xs">{c.value === null ? "" : "Current"}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
