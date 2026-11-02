"use client";

import { useState } from "react";

import { actionLabel, formatAt } from "@/components/audit/AuditRow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCommand } from "@/components/useCommand";
import { NOTE_MAX_LENGTH } from "@/domain/commands";
import { useInvoiceActivity } from "@/store/hooks";

/**
 * The Investigation page's Activity card (TASK-14.7): a reverse-chronological
 * audit trail for one invoice with a plain note box under it. An audit trail,
 * not a chat. Intended mount: the Investigation right column (TASK-7.9).
 */
export function ActivityLog({ invoiceId }: { invoiceId: string }) {
  const events = useInvoiceActivity(invoiceId);
  const run = useCommand();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldId = `activity-note-${invoiceId}`;

  async function addNote() {
    if (!run || busy || note.trim() === "") return;
    setBusy(true);
    try {
      await run({ type: "add_note", subject: { kind: "invoice", id: invoiceId }, payload: { text: note } });
      setNote("");
    } catch {
      // Reason shown as a toast; keep the draft so nothing typed is lost.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border glass shadow-card p-4" aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`} className="mb-2 text-sm font-semibold text-text">
        Activity
      </h2>
      {events === undefined ? (
        <p className="py-2 text-[13px] text-text-muted" aria-busy="true">
          Loading activity…
        </p>
      ) : events.length === 0 ? (
        <p className="py-2 text-[13px] text-text-muted">No activity on this invoice yet.</p>
      ) : (
        <ol aria-label="Activity" className="mb-3">
          {events.map((e) => {
            const at = typeof e.at === "string" ? e.at : undefined;
            return (
              <li key={e.event_id} className="border-b border-border py-2 text-[13px] last:border-b-0" data-testid="activity-row">
                <span className="text-text">{typeof e.summary === "string" ? e.summary : actionLabel(e.action)}</span>
                <span className="block text-xs text-text-muted">
                  {typeof e.actor_label === "string" ? e.actor_label : "—"} · {actionLabel(e.action)} ·{" "}
                  <time dateTime={at}>{formatAt(at)}</time>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <label htmlFor={fieldId} className="mb-1 block text-xs font-medium text-text-muted">
        Add a note
      </label>
      <Textarea
        id={fieldId}
        value={note}
        maxLength={NOTE_MAX_LENGTH}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Visible to your team in the audit log"
        disabled={!run}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={addNote} disabled={!run || busy || note.trim() === ""}>
          Add note
        </Button>
      </div>
    </section>
  );
}
