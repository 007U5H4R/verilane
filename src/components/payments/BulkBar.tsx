"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/domain/payments/listing";
import { MISSING, STATE_META, type AssessedCase } from "@/domain/payments/reconcile";
import { useExecute } from "@/store/hooks";
import { cn } from "@/lib/cn";
import { CommandDialog, NoteField } from "./CaseActions";
import { download } from "./download";
import type { PaymentsModel } from "./model";
import { CARD } from "./parts";

/* ---------- bulk: assign, export, escalate ---------- */

export function BulkBar({ rows, model, onDone }: { rows: { id: string; c: AssessedCase }[]; model: PaymentsModel; onDone: () => void }) {
  const execute = useExecute();
  const [dialog, setDialog] = useState<"assign" | "escalate" | null>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<"analyst" | "manager">("manager");
  const openItems = rows.flatMap((r) => r.c.case.items.filter((i) => i.status === "open"));

  const flagAll = async (payload: Record<string, unknown>) => {
    for (const item of openItems) {
      await execute({ type: "reconcile_flag", subject: { kind: "review", id: item.review_id }, payload });
    }
    onDone();
  };

  const exportCsv = () => {
    const csv = toCsv(
      ["Email", "State", "Customer", "Invoices", "Claimed (INR)", "Ledger outstanding (INR)", "Difference (INR)"],
      rows.map((r) => [
        r.id,
        STATE_META[r.c.state].label,
        r.c.customer?.name ?? MISSING.na,
        r.c.case.invoiceIds.map((id) => model.data.invoices.get(id)?.invoice_number ?? id).join(" "),
        r.c.claim.amount_paise !== undefined ? (r.c.claim.amount_paise / 100).toFixed(2) : MISSING.customer,
        r.c.outstanding !== undefined ? (r.c.outstanding / 100).toFixed(2) : MISSING.na,
        r.c.discrepancy !== undefined ? (r.c.discrepancy / 100).toFixed(2) : MISSING.na,
      ]),
    );
    download(csv, "reconciliation-cases.csv");
  };

  return (
    <div className={cn(CARD, "flex flex-wrap items-center gap-2 p-3")} role="region" aria-label="Bulk actions">
      <span className="text-sm text-text" aria-live="polite">
        {rows.length} selected
      </span>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDialog("assign")}>
        Assign
      </Button>
      <Button size="sm" variant="outline" className="rounded-full" onClick={exportCsv}>
        Export CSV
      </Button>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDialog("escalate")}>
        Escalate
      </Button>
      <Button size="sm" variant="ghost" className="rounded-full" onClick={onDone}>
        Clear
      </Button>

      <CommandDialog
        open={dialog === "assign"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Assign ${rows.length} ${rows.length === 1 ? "case" : "cases"}?`}
        description={<p>Records who owns these cases. Nothing else changes.</p>}
        confirmLabel="Assign"
        success="Cases assigned."
        onConfirm={() => flagAll({ step: "assign", assignee })}
      >
        <fieldset className="flex gap-4 text-sm text-text">
          <legend className="mb-1 text-sm font-medium">Assign to</legend>
          {(["analyst", "manager"] as const).map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="radio" name="bulk-assignee" className="accent-brand" checked={assignee === a} onChange={() => setAssignee(a)} />
              {a === "manager" ? "Manager" : "Analyst"}
            </label>
          ))}
        </fieldset>
      </CommandDialog>

      <CommandDialog
        open={dialog === "escalate"}
        onOpenChange={(o) => {
          if (!o) setDialog(null);
          setNote("");
        }}
        title={`Escalate ${rows.length} ${rows.length === 1 ? "case" : "cases"} to a Manager?`}
        description={<p>Each case moves to Manager review with your reason.</p>}
        confirmLabel="Escalate"
        canConfirm={note.trim() !== ""}
        success="Escalated to a Manager."
        onConfirm={() => flagAll({ step: "escalate", note: note.trim() })}
      >
        <NoteField label="Reason" value={note} onChange={setNote} required />
      </CommandDialog>
    </div>
  );
}

