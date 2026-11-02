"use client";

import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { DataProviderLoader } from "@/components/DataProviderLoader";
import { AppShell } from "@/components/shell/AppShell";
import { isAuthRoute, useIsStoredGuest, useSession } from "@/lib/session";

// Lazy: the badge only renders for a stored guest, so it stays out of every
// route's first-load JS (route-budget).
const GuestBadge = dynamic(() => import("./GuestBadge").then((m) => m.GuestBadge), { ssr: false });

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
    if (session === null) router.replace("/welcome");
  }, [session, router]);

  if (session !== "guest") return <GateSkeleton />;
  return (
    <DataProviderLoader>
      <AppShell>{children}</AppShell>
      <InterimGuestDock />
    </DataProviderLoader>
  );
}

/**
 * INTERIM (TASK-39): the guest badge belongs in TopBar, which this task may
 * not edit. Until it is wired there (see the TASK-39 report), it floats
 * bottom-right, above the mobile bottom tabs. Shown only for a visitor who
 * chose guest mode — never for the e2e build's implicit default session.
 * Delete this component and its use once TopBar mounts <GuestBadge />.
 */
function InterimGuestDock() {
  const storedGuest = useIsStoredGuest();
  if (!storedGuest) return null;
  return (
    <div className="fixed right-3 bottom-[4.75rem] z-30 md:right-5 md:bottom-5">
      <GuestBadge placement="up" />
    </div>
  );
}

/** Neutral first paint: no shell chrome, no data — just a quiet status. */
export function GateSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div role="status" aria-busy="true" aria-label="Loading workspace" className="flex flex-col items-center gap-3">
        <span className="ob-spinner size-6 rounded-full border-2 border-border border-t-brand" aria-hidden />
        <span className="text-sm text-text-muted">Loading workspace…</span>
      </div>
    </div>
  );
}
