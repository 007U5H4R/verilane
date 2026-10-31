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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatInr, paise } from "@/domain/money";
import { DbContext, useExecute } from "@/store/hooks";

/**
 * Confirms before Approve & send runs the draft through `approve_draft`
 * (TASK-16.2/16.4): no network call, status → `sent_simulated` on success.
 * `approve_draft` re-runs the nine checks inside the transaction, so a
 * confirm can still come back with a `validation_failure` instead of
 * throwing — that's reported as a failure, not a silent success.
 * Externally controlled (`open`/`onOpenChange`), mirroring
 * `MarkDisputedDialog`.
 */
export function ApproveDialog({
  draftId,
  invoiceId,
  customerName,
  amountPaise,
  open,
  onOpenChange,
  onApproved,
}: {
  draftId: string;
  invoiceId: string;
  customerName: string;
  amountPaise: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved?: () => void;
}) {
  const db = useContext(DbContext);
  const execute = useExecute();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!db || busy) return;
    setBusy(true);
    try {
      const event = await execute({
        type: "approve_draft",
        subject: { kind: "draft", id: draftId },
      });
      onOpenChange(false);
      if (event.action === "validation_failure") {
        toast.error(`Reminder for ${invoiceId} (${customerName}) failed re-validation and was not sent.`);
      } else {
        toast.success(`Reminder for ${invoiceId} (${customerName}) approved and sent (simulated).`);
        onApproved?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t approve this reminder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve and send this reminder?</AlertDialogTitle>
          <AlertDialogDescription>
            This sends a simulated reminder for {invoiceId} to {customerName} for{" "}
            {formatInr(paise(amountPaise))}. No real email is sent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button type="button" onClick={confirm} disabled={busy || !db}>
            {busy ? "Sending…" : "Approve & send"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
