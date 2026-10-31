"use client";

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
import { resetDemo } from "@/store/dataCommands";
import { DbContext } from "@/store/hooks";

/**
 * Reset demo data behind a confirmation (TC-060). Settings and the
 * seed-update prompt both use this, so there is one reset path: the audited
 * `reset_demo` command.
 */
export function ResetDialog({
  size = "sm",
  label = "Reset demo data",
  onReset,
}: {
  size?: "sm" | "default";
  label?: string;
  onReset?: () => void;
}) {
  const db = useContext(DbContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size={size} disabled={!db}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
          <AlertDialogDescription>
            This replaces every invoice, note, draft, dispute and audit entry in this browser with a fresh copy of the demo
            set. The as-of date returns to its default. Your role is kept. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
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
