/**
 * TASK-8.5: shown when the stored seed is older than the served manifest.
 * The loader never auto-wipes (TC-014); Reset is the only way to the new
 * data, and it stays disabled with a reason until Settings lands (TASK-19).
 */
"use client";
import { Button } from "@/components/ui/button";
import { useSeedUpdateAvailable } from "@/store/hooks";

export function SeedUpdatePrompt() {
  const updateAvailable = useSeedUpdateAvailable();
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-brand-tint px-6 py-2 text-[13px] text-text"
    >
      <span className="font-semibold">New demo data available</span>
      <span className="text-text-muted">Your current data and notes are kept until you reset.</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled
        aria-describedby="seed-reset-reason"
        className="ml-auto"
      >
        Reset
      </Button>
      <span id="seed-reset-reason" className="text-text-muted">
        Reset arrives with Settings
      </span>
    </div>
  );
}
