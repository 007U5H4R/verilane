"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { autopilotEligibility } from "@/domain/autopilot";
import type { VerilaneDb } from "@/store/db";
import { DbContext, useAutopilotPolicy, useDraftsAwaitingApproval } from "@/store/hooks";
import { execute } from "@/store/tx";
import { runAutopilotBatch } from "./autopilotBatch";

/**
 * TASK-41 · Copilot autopilot (simulated). While a Manager has autopilot on,
 * sends each awaiting draft the client judges eligible, one at a time,
 * through `autopilot_send` — which re-runs the nine checks and the policy
 * inside the transaction, so this list is only a hint, never the gate.
 *
 * Stop rule: each draft is attempted at most once per mount. A sent draft
 * leaves the awaiting list; a held one is re-checked and stored, so it no
 * longer looks eligible. Unmounting stops the batch (CR-007). Renders nothing.
 */
export function AutopilotRunner() {
  const db = useContext(DbContext);
  // No database (prerender, or IndexedDB unavailable): nothing to run.
  return db ? <Runner db={db} /> : null;
}

function Runner({ db }: { db: VerilaneDb }) {
  const policy = useAutopilotPolicy();
  const drafts = useDraftsAwaitingApproval();
  const attempted = useRef(new Set<string>());
  const running = useRef(false);
  // Re-evaluates once a batch ends, for drafts that arrived while it ran.
  const [pass, setPass] = useState(0);
  // Unmount-only: the send effect re-runs as each sent draft leaves the
  // list, so its own cleanup must not cancel the batch in flight.
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  useEffect(() => {
    if (!policy?.enabled || !drafts || running.current) return;
    const due = drafts.filter(
      ({ draft }) => !attempted.current.has(draft.draft_id) && autopilotEligibility(draft, policy).eligible,
    );
    if (due.length === 0) return;
    running.current = true;
    for (const { draft } of due) attempted.current.add(draft.draft_id);
    const items = due.map(({ draft, customer }) => ({ id: draft.draft_id, who: customer?.name ?? draft.customer_id }));
    void runAutopilotBatch(items, {
      send: async (id) => {
        const event = await execute(db, { type: "autopilot_send", subject: { kind: "draft", id } });
        return event.action === "autopilot_send" ? "sent" : "held";
      },
      notify: ({ kind, who }) => {
        if (kind === "sent") toast.success(`Copilot sent the reminder to ${who} (simulated).`);
        else if (kind === "held") toast.message(`Copilot held the reminder to ${who} for you.`);
        else toast.error(`Copilot couldn't send the reminder to ${who}. It's waiting for you in Drafts.`);
      },
      isCancelled: () => unmounted.current,
    }).finally(() => {
      running.current = false;
      if (!unmounted.current) setPass((n) => n + 1);
    });
  }, [db, policy, drafts, pass]);

  return null;
}
