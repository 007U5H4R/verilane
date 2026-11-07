"use client";

import { Undo2 } from "lucide-react";
import { useState } from "react";
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
import type { Permission } from "@/domain/permissions";
import type { Payment } from "@/domain/schema";
import { useCan, useExecute, type ExceptionDetail } from "@/store/hooks";

/**
 * TKT-75.06 (Design-TASK-75 A1 item 3, Discovery F16): the Manager-only
 * "Reverse allocation" control on a resolved allocation. Its own section,
 * deliberately outside the action bar (§11), so it stays separate from the
 * allocate/execute actions. Hidden for an Analyst — no dead control (ticket
 * AC, EXE143). The confirm step is an AlertDialog; the command is the
 * audited `reverse_allocation` (one rw transaction, EXE140).
 */

/** The allocation this item can reverse, or `null` when there is none. */
export function reversibleAllocation(
  d: ExceptionDetail,
): { paymentId: string; invoiceId: string; amountPaise: Payment["amount_paise"] } | null {
  const x = d.exception;
  if (x.kind !== "unallocated_payment" || x.status !== "actioned") return null;
  const invoiceId = x.invoice_id;
  const p = d.payment;
  if (invoiceId === undefined || !p || p.invoice_id !== invoiceId) return null;
  return { paymentId: p.payment_id, invoiceId, amountPaise: p.amount_paise };
}

/**
 * Whether the confirm dialog may be mounted at all: there is something to
 * reverse AND the role may reverse it (review r2 m4). A role switch to
 * Analyst while the dialog is open unmounts it rather than leaving a
 * Manager-only dialog in front of an Analyst.
 */
export function canOfferReversal(d: ExceptionDetail, permission: Permission): boolean {
  return permission.allowed && reversibleAllocation(d) !== null;
}

// Its own block under the action bar, aligned to the detail page's max width.
const CARD = "mx-auto mt-4 flex w-full max-w-6xl min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card";

export interface ReverseAllocationPanelProps {
  detail: ExceptionDetail;
  permission: Permission;
  busy: boolean;
  onRequest: () => void;
}

/**
 * Presentational part. Renders nothing unless there is a reversible
 * allocation AND the role may reverse it; a reopened, reversed item shows
 * the (role-independent) notice that it was reversed.
 */
export function ReverseAllocationPanel({ detail, permission, busy, onRequest }: ReverseAllocationPanelProps) {
  const x = detail.exception;
  if (x.status === "open" && x.reopen_reason === "reversed") {
    return (
      <section className={CARD} aria-labelledby="reverse-allocation" data-testid="reversed-notice">
        <h2 id="reverse-allocation" className="font-semibold text-text">
          Allocation reversed
        </h2>
        <p className="text-sm text-text-muted">
          A Manager reversed this payment’s allocation. The item is open again; choose the invoice it settles.
        </p>
      </section>
    );
  }
  const allocation = reversibleAllocation(detail);
  if (allocation === null || !permission.allowed) return null;
  return (
    <section className={CARD} aria-labelledby="reverse-allocation" data-testid="reverse-allocation">
      <h2 id="reverse-allocation" className="font-semibold text-text">
        Reverse allocation
      </h2>
      <p className="text-sm text-text-muted">
        Payment {allocation.paymentId} ({formatInr(allocation.amountPaise)}) is applied to {allocation.invoiceId}.
        Reversing it unapplies the payment, restores the invoice balance and reopens this item. Manager only; the
        reversal is audited.
      </p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="reverse-allocation-open"
          disabled={busy}
          onClick={onRequest}
          className="border-high/60 text-high hover:bg-high-bg max-md:min-h-11"
        >
          <Undo2 aria-hidden />
          {busy ? "Reversing…" : "Reverse allocation"}
        </Button>
      </div>
    </section>
  );
}

export function ReverseAllocationSection({ detail }: { detail: ExceptionDetail }) {
  const x = detail.exception;
  const permission = useCan("reverse_allocation", { kind: "review", id: x.review_id, requires_role: x.requires_role });
  const execute = useExecute();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allocation = reversibleAllocation(detail);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const event = await execute({ type: "reverse_allocation", subject: { kind: "review", id: x.review_id }, payload: {} });
      setOpen(false);
      toast.success(String(event.summary ?? "Allocation reversed."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn’t reverse this allocation. Nothing was changed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ReverseAllocationPanel
        detail={detail}
        permission={permission}
        busy={busy}
        onRequest={() => {
          setError(null);
          setOpen(true);
        }}
      />
      {allocation !== null && canOfferReversal(detail, permission) && (
        <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg" data-testid="reverse-allocation-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Reverse this allocation?</AlertDialogTitle>
              <AlertDialogDescription>
                Payment {allocation.paymentId} ({formatInr(allocation.amountPaise)}) will be unapplied from{" "}
                {allocation.invoiceId}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-text">
              <li>{allocation.invoiceId}’s balance and status are restored.</li>
              <li>This item reopens and is marked as reversed.</li>
              <li>The reversal is recorded in the audit trail, with a reference to the original allocation.</li>
            </ul>
            {error !== null && (
              <p role="alert" className="rounded-md bg-high-bg px-3 py-2 text-sm text-high" data-testid="reverse-allocation-error">
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
                data-testid="reverse-allocation-confirm"
              >
                {busy ? "Reversing…" : "Reverse allocation"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
