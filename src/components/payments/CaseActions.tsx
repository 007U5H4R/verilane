"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
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
import { formatInr, paise, parseInr } from "@/domain/money";
import { can, type Role } from "@/domain/permissions";
import { remainingAfter, type AssessedCase } from "@/domain/payments/reconcile";
import { useExecute } from "@/store/hooks";
import { DeniedReason, INPUT, LINK } from "./parts";

/* ---------- a confirm dialog that runs one or more audited commands ---------- */

/**
 * One AlertDialog for every payments action: focus is trapped, Esc closes,
 * focus returns to the trigger. `onConfirm` throws to keep the dialog open
 * and show the command's own error.
 */
export function CommandDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  destructive,
  canConfirm = true,
  onConfirm,
  success,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  canConfirm?: boolean;
  onConfirm: () => Promise<void>;
  success: string;
}) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (busy || !canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That action didn’t complete.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children && <div className="flex flex-col gap-3">{children}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={busy || !canConfirm}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A labelled multi-line note. */
export function NoteField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {required ? "" : " (optional)"}
      </label>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} aria-required={required || undefined} />
    </div>
  );
}

/* ---------- the case's actions ---------- */

type DialogId = "proof" | "bank" | "escalate" | "verify" | "partial" | "reject" | "hold";

const MANAGER_ONLY = "Only a Manager can verify or reject a payment claim.";

/**
 * Every workflow step on a reconciliation case. Nothing here writes to the
 * ledger, creates a ledger row, or changes an invoice's status or balance:
 *  - request proof / bank check / escalate / partial payment are audited
 *    `reconcile_flag` steps (a partial payment is a Manager-review request);
 *  - verify (match to a ledger entry) and reject are Manager-only
 *    `reconcile_decide` decisions that record a review outcome;
 *  - hold reminder adds a note to the invoice.
 */
export function CaseActions({ c, role }: { c: AssessedCase; role: Role }) {
  const execute = useExecute();
  const deniedId = useId();
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const openItems = c.case.items.filter((r) => r.status === "open");
  if (!c.open || openItems.length === 0) return null;

  const head = openItems[0]!;
  const decide = can(role, "reconcile_decide", { kind: "review", id: head.review_id });
  const linkable = c.candidates.filter((k) => k.linkable);
  const invoiceId = c.invoice?.invoice_id ?? c.case.invoiceIds[0];

  const open = (d: DialogId) => {
    setNote("");
    setAmount("");
    setReference("");
    setConfirmed(false);
    setPaymentId(c.recordedPaymentId ?? (linkable.length === 1 ? linkable[0]!.payment.payment_id : ""));
    setDialog(d);
  };
  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };
  /** A flag step on every open item of the case (a duplicate pair is two items, one case). */
  const flag = async (step: string, payload: Record<string, unknown> = {}) => {
    for (const item of openItems) {
      await execute({ type: "reconcile_flag", subject: { kind: "review", id: item.review_id }, payload: { step, ...payload } });
    }
  };
  const trimmed = note.trim();
  const optionalNote = trimmed ? { note: trimmed } : {};

  const parsed = amount.trim() ? parseInr(amount) : null;
  const partial =
    parsed !== null && c.outstanding !== undefined ? remainingAfter(c.outstanding, parsed) : undefined;

  const btn = "rounded-full";
  const managerButton = (label: string, d: DialogId, extra?: { disabled?: boolean; variant?: "outline" | "destructive" }) =>
    decide.allowed ? (
      <Button size="sm" variant={extra?.variant ?? "outline"} className={btn} onClick={() => open(d)} disabled={extra?.disabled}>
        {label}
      </Button>
    ) : (
      <Button size="sm" variant="outline" className={btn} aria-disabled="true" aria-describedby={deniedId} onClick={(e) => e.preventDefault()}>
        {label}
      </Button>
    );

  return (
    <div className="flex flex-col gap-2" data-testid="case-actions">
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Actions for ${c.case.id}`}>
        <Button size="sm" variant="outline" className={btn} onClick={() => open("proof")}>
          Request payment proof
        </Button>
        <Button size="sm" variant="outline" className={btn} onClick={() => open("bank")}>
          Send for bank verification
        </Button>
        {c.case.kind === "payment_claim" &&
          managerButton("Match ledger entry & verify", "verify", { disabled: decide.allowed && linkable.length === 0 })}
        {c.case.kind === "payment_claim" && c.outstanding !== undefined && (
          <Button size="sm" variant="outline" className={btn} onClick={() => open("partial")}>
            Record partial payment
          </Button>
        )}
        <Button size="sm" variant="outline" className={btn} onClick={() => open("escalate")}>
          Escalate to Manager
        </Button>
        {managerButton("Reject claim", "reject")}
        {invoiceId && (
          <Button size="sm" variant="ghost" className={btn} onClick={() => open("hold")}>
            Hold reminders
          </Button>
        )}
      </div>
      {!decide.allowed && <DeniedReason id={deniedId}>{decide.reason}</DeniedReason>}
      {decide.allowed && c.case.kind === "payment_claim" && linkable.length === 0 && (
        <p className="text-xs text-text-muted">No ledger entry on this invoice to verify against — nothing can be matched yet.</p>
      )}

      <CommandDialog
        open={dialog === "proof"}
        onOpenChange={close}
        title="Request payment proof?"
        description={
          <>
            <p>Moves this case to “Awaiting proof” and records who asked. Nothing is sent to the customer.</p>
            {invoiceId && (
              <p>
                Write the request with the reminder draft on{" "}
                <Link href={`/invoices/${invoiceId}#draft-title`} className={LINK}>
                  the invoice
                </Link>{" "}
                — drafts go through approval before anything is sent.
              </p>
            )}
          </>
        }
        confirmLabel="Request proof"
        success="Payment proof requested."
        onConfirm={() => flag("request_proof", optionalNote)}
      >
        <NoteField label="Note" value={note} onChange={setNote} />
      </CommandDialog>

      <CommandDialog
        open={dialog === "bank"}
        onOpenChange={close}
        title="Send for bank verification?"
        description={<p>Moves this case to “Bank check” until someone confirms the credit on the bank statement.</p>}
        confirmLabel="Send for bank check"
        success="Sent for bank verification."
        onConfirm={() => flag("bank_verification", optionalNote)}
      >
        <NoteField label="Note" value={note} onChange={setNote} />
      </CommandDialog>

      <CommandDialog
        open={dialog === "escalate"}
        onOpenChange={close}
        title="Escalate to a Manager?"
        description={<p>A Manager reviews the claim. Say what they need to look at.</p>}
        confirmLabel="Escalate"
        canConfirm={trimmed !== ""}
        success="Escalated to a Manager."
        onConfirm={() => flag("escalate", { note: trimmed })}
      >
        <NoteField label="Reason" value={note} onChange={setNote} required />
      </CommandDialog>

      <CommandDialog
        open={dialog === "partial"}
        onOpenChange={close}
        title="Record a partial payment?"
        description={
          <>
            <p>
              This sends a partial-payment request to a Manager for review. It does not write to the ledger or change the
              invoice balance.
            </p>
            {c.outstanding !== undefined && <p>Ledger outstanding: {formatInr(c.outstanding)}</p>}
          </>
        }
        confirmLabel="Send for Manager review"
        canConfirm={partial?.valid === true}
        success="Partial payment sent for Manager review."
        onConfirm={() => flag("request_partial", { amount_paise: parsed ?? 0, ...optionalNote })}
      >
        <PartialFields amount={amount} setAmount={setAmount} result={partial} parsedOk={amount.trim() === "" || parsed !== null} />
        <NoteField label="Note" value={note} onChange={setNote} />
      </CommandDialog>

      {decide.allowed && (
        <CommandDialog
          open={dialog === "verify"}
          onOpenChange={close}
          title="Match to a ledger entry and verify?"
          description={
            <p>
              Records that this claim is the ledger entry you choose, with the evidence you saw. The ledger itself is not
              changed. Only entries on the same invoice and customer can be chosen.
            </p>
          }
          confirmLabel="Verify"
          canConfirm={paymentId !== "" && reference.trim() !== "" && confirmed}
          success="Claim verified against the ledger."
          onConfirm={() =>
            execute({
              type: "reconcile_decide",
              subject: { kind: "review", id: head.review_id },
              payload: { decision: "verify", payment_id: paymentId, reference: reference.trim(), confirmed: true, ...optionalNote },
            }).then(() => undefined)
          }
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium text-text">Ledger entry</legend>
            {linkable.map((k) => (
              <label key={k.payment.payment_id} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="verify-payment"
                  value={k.payment.payment_id}
                  checked={paymentId === k.payment.payment_id}
                  onChange={() => setPaymentId(k.payment.payment_id)}
                  className="accent-brand"
                />
                <span className="font-mono">{k.payment.payment_id}</span>
                <span className="tabular-nums">{formatInr(paise(k.payment.amount_paise))}</span>
                <span className="text-text-muted">{k.payment.paid_on}</span>
                {k.tier !== "exact" && <span className="text-xs text-text-muted">(amount differs)</span>}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-medium text-text">
            Evidence (bank statement line or reference)
            <input className={INPUT} value={reference} onChange={(e) => setReference(e.target.value)} aria-required="true" />
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-brand" />
            I checked this entry against the evidence.
          </label>
        </CommandDialog>
      )}

      {decide.allowed && (
        <CommandDialog
          open={dialog === "reject"}
          onOpenChange={close}
          title="Reject this payment claim?"
          description={<p>Closes the case as rejected. The ledger and the invoice are not changed.</p>}
          confirmLabel="Reject claim"
          destructive
          canConfirm={trimmed !== ""}
          success="Claim rejected."
          onConfirm={async () => {
            for (const item of openItems) {
              await execute({
                type: "reconcile_decide",
                subject: { kind: "review", id: item.review_id },
                payload: { decision: "reject", reason: trimmed },
              });
            }
          }}
        >
          <NoteField label="Reason" value={note} onChange={setNote} required />
        </CommandDialog>
      )}

      {invoiceId && (
        <CommandDialog
          open={dialog === "hold"}
          onOpenChange={close}
          title="Hold reminders for this invoice?"
          description={
            <p>
              Adds a note to the invoice saying a payment claim is under review, so whoever drafts the next reminder sees it.
              It does not pause anything automatically.
            </p>
          }
          confirmLabel="Add hold note"
          success="Hold note added to the invoice."
          onConfirm={() =>
            execute({
              type: "add_note",
              subject: { kind: "invoice", id: invoiceId },
              payload: { text: `Hold reminders: payment claim ${c.case.id} is under review.${trimmed ? ` ${trimmed}` : ""}` },
            }).then(() => undefined)
          }
        >
          <NoteField label="Note" value={note} onChange={setNote} />
        </CommandDialog>
      )}
    </div>
  );
}

function PartialFields({
  amount,
  setAmount,
  result,
  parsedOk,
}: {
  amount: string;
  setAmount: (v: string) => void;
  result: ReturnType<typeof remainingAfter> | undefined;
  parsedOk: boolean;
}) {
  const id = useId();
  const msg = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text">
        Amount received (₹)
      </label>
      <input
        id={id}
        className={INPUT}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-describedby={msg}
        aria-invalid={!parsedOk || result?.valid === false || undefined}
      />
      <p id={msg} className="text-xs text-text-muted" aria-live="polite">
        {!parsedOk
          ? "Enter an amount like 1,50,000."
          : result === undefined
            ? "The remaining balance is shown once you enter an amount."
            : result.valid
              ? `${formatInr(result.remaining)} would remain outstanding.`
              : result.reason}
      </p>
    </div>
  );
}

export { MANAGER_ONLY };
