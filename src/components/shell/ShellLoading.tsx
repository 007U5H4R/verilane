"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { ContentSkeleton, ShellSkeleton } from "@/components/states/ShellSkeleton";

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading workspace" data-state="loading">
      <ContentSkeleton />
    </div>
  );
}

/**
 * R3: shown while the DataProvider chunk loads and the db opens, so the first
 * paint is the shell plus a skeleton rather than a blank page. The shell's
 * own data hooks already tolerate a missing db. AppShell reads the pathname,
 * which suspends while prerendering a dynamic route (/invoices/[id]); there
 * the frame skeleton paints until the client renders the shell.
 */
export function ShellLoading() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AppShell>
        <Skeleton />
      </AppShell>
    </Suspense>
  );
}
