"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { RowSkeleton } from "@/components/states/RowSkeleton";

function Skeleton() {
  return (
    <div className="p-4 md:p-7">
      <RowSkeleton label="Loading workspace" />
    </div>
  );
}

/**
 * R3: shown while the DataProvider chunk loads and the db opens, so the first
 * paint is the shell plus a skeleton rather than a blank page. The shell's
 * own data hooks already tolerate a missing db. AppShell reads the pathname,
 * which suspends while prerendering a dynamic route (/invoices/[id]); there
 * the bare skeleton paints until the client renders the shell.
 */
export function ShellLoading() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AppShell>
        <Skeleton />
      </AppShell>
    </Suspense>
  );
}
