"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DataProviderLoader } from "@/components/DataProviderLoader";
import { AppShell } from "@/components/shell/AppShell";
import { ShellSkeleton } from "@/components/states/ShellSkeleton";
import { isAuthRoute, useSession } from "@/lib/session";

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
