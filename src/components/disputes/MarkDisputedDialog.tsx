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
import { Textarea } from "@/components/ui/textarea";
import type { DisputeType } from "@/domain/schema";
import { DbContext, useExecute } from "@/store/hooks";
import { DISPUTE_TYPE_LABELS } from "./DisputeLabels";

const DISPUTE_TYPE_OPTIONS = Object.keys(DISPUTE_TYPE_LABELS) as DisputeType[];

/**
 * Opens a Dispute by hand for an invoice (TASK-17.1's `mark_disputed`
 * command), with a dispute type and claim text. Externally controlled
 * (`open`/`onOpenChange`), not self-triggering like `ResetDialog`: the
 * Investigation ActionBar (TASK-15, merged separately) owns the button
 * that opens it, so this component is exported but intentionally not
 * mounted anywhere yet.
 */
export function MarkDisputedDialog({
  invoiceId,
  open,
  onOpenChange,
  onDisputed,
}: {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisputed?: () => void;
}) {
  const db = useContext(DbContext);
  const execute = useExecute();
  const [type, setType] = useState<DisputeType>("unknown");
  const [claimText, setClaimText] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setType("unknown");
    setClaimText("");
  }

  async function confirm() {
    if (!db || busy) return;
    const trimmed = claimText.trim();
    if (trimmed === "") {
      toast.error("A dispute needs a reason.");
      return;
    }
    setBusy(true);
    try {
      await execute({
        type: "mark_disputed",
        subject: { kind: "invoice", id: invoiceId },
        payload: { type, claim_text: trimmed },
      });
      onOpenChange(false);
      reset();
      toast.success("Marked as disputed.");
      onDisputed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t mark this invoice as disputed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as disputed?</AlertDialogTitle>
          <AlertDialogDescription>
            This opens a dispute for this invoice and excludes it from the queue until it’s resolved or rejected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-text">
            Dispute type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DisputeType)}
              disabled={busy}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {DISPUTE_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {DISPUTE_TYPE_LABELS[opt]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-text">
            Claim
            <Textarea
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              disabled={busy}
              placeholder="What is the customer disputing?"
            />
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button type="button" onClick={confirm} disabled={busy || !db}>
            {busy ? "Marking…" : "Mark as disputed"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
