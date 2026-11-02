"use client";

import { RotateCcw } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/components/investigation/DocumentCard";
import { AS_OF_DATE } from "@/domain/clock";
import { cn } from "@/lib/cn";
import { resetDemo } from "@/store/dataCommands";
import { DbContext } from "@/store/hooks";
import { useOnline } from "@/lib/useOnline";

/**
 * Reset demo data behind a confirmation (TC-060). Settings and the
 * seed-update prompt both use this, so there is one reset path: the audited
 * `reset_demo` command.
 */
export function ResetDialog({
  size = "sm",
  label = "Reset demo data",
  onReset,
  tone = "neutral",
}: {
  size?: "sm" | "default";
  label?: string;
  onReset?: () => void;
  /** "danger": the red-outline trigger Settings uses (TASK-38). */
  tone?: "neutral" | "danger";
}) {
  const db = useContext(DbContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const online = useOnline();

  async function confirm() {
    if (!db || busy) return;
    setBusy(true);
    try {
      await resetDemo(db);
      setOpen(false);
      toast.success("Demo data reset.");
      onReset?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t reset the demo data. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <div className="flex flex-col gap-1.5">
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={size}
            disabled={!db || !online}
            className={cn(tone === "danger" && "border-high/60 text-high hover:bg-high-bg")}
          >
            {tone === "danger" && <RotateCcw aria-hidden />}
            {label}
          </Button>
        </AlertDialogTrigger>
        {!online && (
          <p role="status" data-testid="reset-offline-reason" className="text-[13px] text-text-muted">
            Unavailable offline — reconnect to reset.
          </p>
        )}
      </div>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset workspace demo data?</AlertDialogTitle>
          <AlertDialogDescription>
            This will restore the original synthetic dataset and clear user-created demo changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-text">
          <li>Invoices, customers, payments and emails reload from the shipped demo set, replacing any imports.</li>
          <li>Notes, drafts, disputes and review decisions are cleared; extraction results and priorities are recomputed.</li>
          <li>The audit log is cleared; the reset becomes its first entry.</li>
          <li>The as-of date returns to its default ({formatDate(AS_OF_DATE)}).</li>
          <li>Your role and theme are kept.</li>
        </ul>
        <p className="text-[13px] font-medium text-text">This can’t be undone.</p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Resetting…" : "Reset"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
