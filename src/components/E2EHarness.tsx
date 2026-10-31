"use client";

import { useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { ActivityLog } from "@/components/investigation/ActivityLog";
import { Button } from "@/components/ui/button";
import { useCommand } from "@/components/useCommand";
import { paise } from "@/domain/money";
import type { Subject } from "@/domain/permissions";
import { DbContext, useCan, useDb } from "@/store/hooks";

export const HARNESS_INVOICE_ID = "INV-A";
export const HARNESS_DRAFT_ID = "E2E-DRAFT-1";

/** Test-only surface for TC-039/TC-040; mounted by `/e2e-harness` in E2E builds. */
export function E2EHarness() {
  const db = useContext(DbContext);
  if (!db) return <p className="p-7 text-text-muted">Database unavailable.</p>;
  return (
    <div className="grid gap-4 p-7 md:grid-cols-2">
      <ApprovePanel />
      <ActivityLog invoiceId={HARNESS_INVOICE_ID} />
    </div>
  );
}

function ApprovePanel() {
  const db = useDb();
  const run = useCommand();
  const draft = useLiveQuery(() => db.drafts.get(HARNESS_DRAFT_ID), [db]);
  const subject: Subject = { kind: "draft", id: HARNESS_DRAFT_ID };
  if (draft && typeof draft.amount_paise === "number") subject.amount_paise = paise(draft.amount_paise);
  const permission = useCan("approve_draft", subject);
  const reasonId = "approve-reason";

  if (!draft) return <p className="text-text-muted">No harness draft.</p>;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">Reminder {HARNESS_DRAFT_ID}</h2>
      <p className="text-[13px] text-text-muted">
        Status: <span data-testid="draft-status">{String(draft.status)}</span>
      </p>
      <div>
        <Button
          disabled={!permission.allowed}
          aria-describedby={permission.allowed ? undefined : reasonId}
          onClick={() => {
            run?.({ type: "approve_draft", subject: { kind: "draft", id: HARNESS_DRAFT_ID } }).catch(() => {});
          }}
        >
          Approve &amp; send
        </Button>
      </div>
      {!permission.allowed && (
        <p id={reasonId} className="text-[13px] text-text-muted">
          {permission.reason}
        </p>
      )}
    </section>
  );
}
