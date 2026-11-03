"use client";

import { useId, useState } from "react";
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
import type { DisputeCase } from "@/domain/disputes/listing";
import {
  DISPUTE_TEAM,
  eventsFor,
  outcomeAvailability,
  RESOLUTION_CODES,
  RESOLUTION_EFFECT,
  RESOLUTION_LABELS,
  type DisputeReviewer,
  type ResolutionCode,
} from "@/domain/disputes/model";
import { cn } from "@/lib/cn";
import { useExecute, useRole } from "@/store/hooks";

const FIELD =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text outline-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Record how a dispute ends (TASK-38). Outcome and notes are required;
 * evidence, date and reviewer are optional. Outcomes the domain cannot
 * honour are shown disabled with the reason. Each step is its own audited
 * command; nothing here touches the invoice, marks it paid or resumes
 * chasing.
 */
export function ResolveDialog({
  item,
  open,
  onOpenChange,
}: {
  item: DisputeCase;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const execute = useExecute();
  const role = useRole();
  const ids = useId();
  const [code, setCode] = useState<ResolutionCode | null>(null);
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState("");
  const [date, setDate] = useState("");
  const [reviewer, setReviewer] = useState<DisputeReviewer | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { dispute } = item;
  const facts = { status: dispute.status, ledgerPaymentCount: item.ledgerPayments.length, isManager: role === "manager" };

  function reset() {
    setCode(null);
    setNotes("");
    setEvidence("");
    setDate("");
    setReviewer("");
    setError(null);
  }

  async function confirm() {
    if (busy) return;
    if (!code) return setError("Choose an outcome.");
    const avail = outcomeAvailability(code, facts);
    if (!avail.available) return setError(avail.reason);
    const trimmed = notes.trim();
    if (!trimmed) return setError("Resolution notes are required.");
    setError(null);
    setBusy(true);
    const subject = { kind: "dispute" as const, id: dispute.dispute_id };
    try {
      for (const event of eventsFor(code, dispute.status)) {
        if (event === "resolve" || event === "reject") {
          await execute({
            type: "resolve_dispute",
            subject,
            payload: {
              outcome: event === "resolve" ? "resolved" : "rejected",
              resolution: {
                code,
                notes: trimmed,
                ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
                ...(date ? { date } : {}),
                ...(reviewer ? { reviewer } : {}),
              },
            },
          });
        } else if (event === "await_customer") {
          await execute({ type: "dispute_transition", subject, payload: { event, note: trimmed } });
        } else {
          await execute({ type: "dispute_transition", subject, payload: { event } });
        }
      }
      onOpenChange(false);
      reset();
      toast.success(
        RESOLUTION_EFFECT[code] === "await_customer"
          ? `${dispute.dispute_id} is now waiting on the customer.`
          : `${dispute.dispute_id} recorded as ${RESOLUTION_LABELS[code].toLowerCase()}.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn’t record the outcome.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Resolve dispute</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono">{dispute.dispute_id}</span> · {item.customerName} ·{" "}
            <span className="font-mono">{item.invoiceLabel}</span>. Recording an outcome never marks the invoice
            paid and never resumes chasing.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <fieldset className="flex flex-col gap-1.5" disabled={busy}>
            <legend className="mb-1 text-sm font-medium text-text">
              Outcome <span className="text-high">*</span>
            </legend>
            {RESOLUTION_CODES.map((c) => {
              const a = outcomeAvailability(c, facts);
              const reasonId = `${ids}-${c}-reason`;
              return (
                <label
                  key={c}
                  className={cn(
                    "flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm",
                    a.available ? "cursor-pointer text-text hover:bg-surface-sunken" : "cursor-not-allowed text-text-muted",
                    code === c && "border-brand bg-brand-tint",
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-outcome`}
                    value={c}
                    checked={code === c}
                    disabled={!a.available}
                    aria-describedby={a.available ? undefined : reasonId}
                    onChange={() => setCode(c)}
                    className="mt-0.5 accent-brand"
                  />
                  <span className="flex flex-col">
                    {RESOLUTION_LABELS[c]}
                    {!a.available && (
                      <span id={reasonId} className="text-xs">
                        {a.reason}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <label className="flex flex-col gap-1 text-sm text-text">
            <span>
              Resolution notes <span className="text-high">*</span>
            </span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              required
              aria-required
              placeholder="What was found, and what was agreed?"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text">
            Supporting evidence (optional)
            <Textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              disabled={busy}
              placeholder="e.g. credit note number, corrected invoice reference"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-text">
              Resolution date (optional)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text">
              Reviewer (optional)
              <select
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value as DisputeReviewer | "")}
                disabled={busy}
                className={FIELD}
              >
                <option value="">Not recorded</option>
                {DISPUTE_TEAM.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-high-bg px-3 py-2 text-sm text-high">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button type="submit" disabled={busy}>
              {busy ? "Recording…" : "Record outcome"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
