"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut, PlayCircle, UserRound } from "lucide-react";

import { useDismiss } from "@/components/shell/useDismiss";
import { cn } from "@/lib/cn";
import { endGuestSession } from "@/lib/session";

/**
 * TASK-39: the guest-mode indicator — a "Guest · Demo Workspace" pill with a
 * small menu: Product tour, Sign in / Create account, Exit guest mode.
 * Exit clears only the guest flag; demo data in IndexedDB is untouched.
 *
 * `placement` picks which way the menu opens: "down" for a top bar, "up" for
 * a bottom-anchored mount.
 */
export function GuestBadge({ placement = "down", className }: { placement?: "down" | "up"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const exit = () => {
    close();
    endGuestSession();
    router.replace("/welcome");
  };

  const item =
    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-text hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand";

  return (
    <div ref={ref} data-guest-badge className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-brand/25 bg-mint pr-2.5 pl-1.5 text-[13px] font-semibold text-brand-strong shadow-sm hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="grid size-6 place-items-center rounded-full bg-surface text-brand">
          <UserRound className="size-3.5" aria-hidden />
        </span>
        {/* DES-001: below 2xl the top bar has no room for the label — the pill
            shows icon + chevron, the label stays as its accessible name. */}
        <span className="sr-only whitespace-nowrap 2xl:not-sr-only">
          Guest <span aria-hidden>·</span> <span className="font-medium">Demo Workspace</span>
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Guest mode"
          className={cn(
            "absolute right-0 z-40 flex w-64 flex-col gap-0.5 rounded-xl border border-border bg-surface p-2 shadow-lg",
            placement === "down" ? "top-full mt-1.5" : "bottom-full mb-1.5",
          )}
        >
          <p className="px-2.5 pt-1 pb-2 text-xs text-text-muted">You&apos;re exploring with demo data. Accounts aren&apos;t available yet.</p>
          <Link href="/onboarding?step=1" onClick={close} className={item}>
            <PlayCircle className="size-4 text-brand" aria-hidden />
            Product tour
          </Link>
          <Link href="/sign-in" onClick={close} className={item}>
            <LogIn className="size-4 text-brand" aria-hidden />
            Sign in / Create account
          </Link>
          <hr className="my-1 border-border" />
          <button type="button" onClick={exit} className={item}>
            <LogOut className="size-4 text-text-muted" aria-hidden />
            Exit guest mode
          </button>
        </div>
      )}
    </div>
  );
}
