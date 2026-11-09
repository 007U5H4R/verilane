"use client";

import { useState, type ReactNode } from "react";
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
import { formatInr } from "@/domain/money";
import { useCan, useExecute, type ExceptionDetail } from "@/store/hooks";
import { writeOffTarget, type WriteOffControlProps } from "./ShortPaymentSection";

/**
 * TKT-75.05 (FS19, R4): the confirm step and command for the Manager-only
 * "Approve write-off" control. The command is the audited
 * `approve_write_off` — one rw transaction that writes the credit note(s),
 * closes the item(s) and appends the audit event; an Analyst attempt is
 * refused and audited by the command path (EXE153–155).
 *
 * Offline: stays enabled — it is a local IndexedDB write with nothing to
 * sync, like the reversal (EXE143, EXE156).
 *
 * Returns the action-bar control's props plus the dialog element; the dialog
 * is only mounted while the role may write off AND there is a target, so a
 * role switch to Analyst unmounts it (the EXE143 review r2 m4 rule).
 */
export function useWriteOff(detail: ExceptionDetail): { control: Omit<WriteOffControlProps, "detail">; dialog: ReactNode } {
  const x = detail.exception;
  const permission = useCan("approve_write_off", { kind: "review", id: x.review_id, requires_role: x.requires_role });
  const execute = useExecute();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = writeOffTarget(detail);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const event = await execute({ type: "approve_write_off", subject: { kind: "review", id: x.review_id }, payload: {} });
      setOpen(false);
      toast.success(String(event.summary ?? "Write-off approved."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn’t write this off. Nothing was changed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const dialog =
    permission.allowed && target !== null ? (
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg" data-testid="approve-write-off-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this write-off?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatInr(target.totalPaise)} across {target.count} short {target.count === 1 ? "payment" : "payments"} will be
              written off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-text">
            <li>One credit note is created per invoice, for its deducted amount.</li>
            <li>{target.count === 1 ? "This item closes." : "This pattern and its short payments close."}</li>
            <li>The write-off is recorded in the audit trail as approved by a Manager.</li>
          </ul>
          {error !== null && (
            <p role="alert" className="rounded-md bg-high-bg px-3 py-2 text-sm text-high" data-testid="approve-write-off-error">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirm()}
              disabled={busy}
              data-testid="approve-write-off-confirm"
            >
              {busy ? "Writing off…" : "Approve write-off"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ) : null;

  return {
    control: {
      permission,
      busy,
      onRequest: () => {
        setError(null);
        setOpen(true);
      },
    },
    dialog,
  };
}
