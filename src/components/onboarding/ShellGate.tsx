"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DataProviderLoader } from "@/components/DataProviderLoader";
import { AppShell } from "@/components/shell/AppShell";
import { ShellSkeleton } from "@/components/states/ShellSkeleton";
import { requestTour } from "@/components/tour/tourStore";
import { readTourLink } from "@/components/tour/tourLink";
import { isAuthRoute, startGuestSession, useSession } from "@/lib/session";
import { emitSplash } from "@/lib/splash/events";

/**
 * TASK-39: decides what wraps a route.
 * - Auth routes (/welcome, /sign-in, /sign-up, /onboarding) render bare —
 *   no shell, no database open.
 * - Every other route needs a session. Until the client has read it, a
 *   neutral skeleton paints (never app content); with no session the visitor
 *   is sent to /welcome; a guest gets the data provider and the app shell
 *   exactly as before.
 */
export function ShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isAuthRoute(pathname)) return <>{children}</>;
  return <GatedApp>{children}</GatedApp>;
}

function GatedApp({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === undefined) return; // not read yet
    // TASK-44: the shareable demo link (?tour=1) goes straight into the tour —
    // a cold visitor becomes a guest instead of seeing /welcome.
    const link = readTourLink(window.location.search);
    if (link.tour) {
      if (session === null) startGuestSession();
      requestTour();
      const { pathname, hash } = window.location;
      window.history.replaceState(window.history.state, "", `${pathname}${link.rest}${hash}`);
      return;
    }
    if (session === null) router.replace("/welcome");
  }, [session, router]);

  // TASK-45.2: splash phase — the guest session is known.
  useEffect(() => {
    if (session === "guest") emitSplash("session");
  }, [session]);

  if (session !== "guest") return <GateSkeleton />;
  return (
    <DataProviderLoader>
      <AppShell>{children}</AppShell>
    </DataProviderLoader>
  );
}

/** TASK-43: first paint of an app route — the app frame as placeholders,
 * never app content. */
export function GateSkeleton() {
  return <ShellSkeleton />;
}

/** Neutral first paint for shell-less routes (the tour): just a quiet status. */
export function QuietSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div role="status" aria-busy="true" aria-label="Loading workspace" className="flex flex-col items-center gap-3">
        <span className="ob-spinner size-6 rounded-full border-2 border-border border-t-brand" aria-hidden />
        <span className="text-sm text-text-muted">Loading workspace…</span>
      </div>
    </div>
  );
}
