"use client";

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
import type { VerilaneDb } from "@/store/db";
import { execute } from "@/store/tx";
import { partitionForDrafts, reminderEligibility } from "./queueActions";
import type { QueueRow } from "./useQueueTable";

export const DRAFT_CREATED = "Draft created — review and approve on the invoice; nothing was sent.";

const generate = (db: VerilaneDb, id: string) =>
  execute(db, { type: "generate_draft", subject: { kind: "invoice", id } });

const errorText = (err: unknown) => (err instanceof Error ? err.message : "That action failed.");

/**
 * Confirm before drafting one reminder (TASK-38). Drafting never sends: the
 * draft still needs review and approval on the invoice page. A row that
 * isn't eligible never reaches this dialog (the menu doesn't offer it), and
 * it re-checks eligibility before running as a second guard.
 */
export function ReminderDialog({ db, row, onClose }: { db: VerilaneDb; row: QueueRow | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const number = row ? (row.invoice.invoice_number ?? row.invoice.invoice_id) : "";

  async function confirm() {
    if (!row || busy) return;
    if (!reminderEligibility(row.priority.band).eligible) {
      toast.error("This invoice can’t get a reminder right now.");
      onClose();
      return;
    }
    setBusy(true);
    try {
      await generate(db, row.invoice.invoice_id);
      toast.success(DRAFT_CREATED);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={row !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate a reminder draft for {number}?</AlertDialogTitle>
          <AlertDialogDescription>
            {row?.customerName} · {row ? formatInr(row.outstanding) : ""} outstanding. This creates a draft only — nothing is
            sent. Review and approve it on the invoice page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button type="button" onClick={confirm} disabled={busy}>
            {busy ? "Generating…" : "Generate draft"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Batch "Create draft" for the selected rows (TASK-38). Lists what will be
 * drafted and what is refused (with the reason) before anything runs; drafts
 * are generated one at a time through the audited `generate_draft` command,
 * then one summary toast reports created / failed counts.
 */
export function CreateDraftDialog({
  db,
  rows,
  open,
  onOpenChange,
  onDone,
}: {
  db: VerilaneDb;
  rows: QueueRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { eligible, refused } = partitionForDrafts(rows);

  async function confirm() {
    if (busy || eligible.length === 0) return;
    setBusy(true);
    const failed: string[] = [];
    let created = 0;
    for (const r of eligible) {
      try {
        await generate(db, r.invoice.invoice_id);
        created++;
      } catch (err) {
        failed.push(`${r.invoice.invoice_number ?? r.invoice.invoice_id}: ${errorText(err)}`);
      }
    }
    setBusy(false);
    onOpenChange(false);
    onDone();
    const summary = `${created} ${created === 1 ? "draft" : "drafts"} created — review and approve each on its invoice; nothing was sent.`;
    if (failed.length === 0) toast.success(summary);
    else toast.warning(`${summary} ${failed.length} not created.`, { description: failed.join(" · ") });
  }

  const num = (r: QueueRow) => r.invoice.invoice_number ?? r.invoice.invoice_id;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create reminder drafts?</AlertDialogTitle>
          <AlertDialogDescription>
            Drafts are created for review only — nothing is sent until someone approves each one on its invoice.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto text-sm">
          <section aria-labelledby="draft-eligible">
            <h3 id="draft-eligible" className="font-medium text-text">
              Will be drafted ({eligible.length})
            </h3>
            {eligible.length === 0 ? (
              <p className="text-text-muted">None of the selected invoices can get a reminder.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5">
                {eligible.map((r) => (
                  <li key={r.invoice.invoice_id} className="flex justify-between gap-3">
                    <span className="truncate">
                      <span className="font-mono text-[13px]">{num(r)}</span> · {r.customerName}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatInr(r.outstanding)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {refused.length > 0 && (
            <section aria-labelledby="draft-refused">
              <h3 id="draft-refused" className="font-medium text-text">
                Won’t be drafted ({refused.length})
              </h3>
              <ul className="mt-1 flex flex-col gap-1">
                {refused.map(({ row, reason }) => (
                  <li key={row.invoice.invoice_id} className="text-text-muted">
                    <span className="font-mono text-[13px] text-text">{num(row)}</span> — {reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button type="button" onClick={confirm} disabled={busy || eligible.length === 0}>
            {busy
              ? "Creating…"
              : `Create ${eligible.length} ${eligible.length === 1 ? "draft" : "drafts"}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
