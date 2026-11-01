/**
 * TASK-8.5: shown when the stored seed is older than the served manifest.
 * The loader never auto-wipes (TC-014); Reset is the only way to the new
 * data. TASK-19: Reset uses the same confirmed, audited `reset_demo` path as
 * Settings (TC-060). TASK-25 · TC-083: the dialog (Radix AlertDialog) loads in
 * its own chunk only when the prompt shows — this prompt sits in every
 * route's shell, and the dialog alone pushed /queue past the 300 KB budget.
 */
"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import { useSeedUpdateAvailable } from "@/store/hooks";

const ResetDialog = dynamic(() => import("@/components/settings/ResetDialog").then((m) => m.ResetDialog), {
  // Same size and label while the chunk arrives, so nothing shifts.
  loading: () => (
    <Button size="sm" variant="outline" disabled>
      Reset
    </Button>
  ),
});

export function SeedUpdatePrompt() {
  const updateAvailable = useSeedUpdateAvailable();
  // The update flag is computed once at load; after a reset the stored seed
  // is current, so hide the prompt for the rest of this session.
  const [hidden, setHidden] = useState(false);
  if (!updateAvailable || hidden) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-brand-tint px-6 py-2 text-[13px] text-text"
    >
      <span className="font-semibold">New demo data available</span>
      <span className="text-text-muted">Your current data and notes are kept until you reset.</span>
      <span className="ml-auto">
        <ResetDialog label="Reset" onReset={() => setHidden(true)} />
      </span>
    </div>
  );
}
