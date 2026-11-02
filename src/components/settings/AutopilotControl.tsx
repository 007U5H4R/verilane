"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { executeWithToast } from "@/components/useCommand";
import { Button } from "@/components/ui/button";
import { isValidCap, MAX_AUTOPILOT_CAP } from "@/domain/autopilot";
import { formatInr, paise } from "@/domain/money";
import type { VerilaneDb } from "@/store/db";
import { useAutopilotPolicy, useRole } from "@/store/hooks";

/**
 * TASK-41 · Manager-only Copilot autopilot policy (simulated sends). An
 * Analyst sees the current policy read-only, with the reason. The command
 * enforces the role and the cap again; this form only shapes the request.
 */
export function AutopilotControl({ db }: { db: VerilaneDb }) {
  const id = useId();
  const role = useRole();
  const policy = useAutopilotPolicy();
  const [capDraft, setCapDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!policy) return <p className="text-[13px] text-text-muted">Loading autopilot policy…</p>;

  const isManager = role === "manager";
  const capRupees = capDraft ?? String(policy.max_amount_paise / 100);
  const capPaise = Number(capRupees) * 100;
  const capOk = /^\d+$/.test(capRupees) && isValidCap(capPaise);

  async function save(enabled: boolean, cap: number) {
    if (busy) return;
    setBusy(true);
    try {
      await executeWithToast(db, {
        type: "set_autopilot",
        subject: { kind: "system", id: "autopilot" },
        payload: { enabled, max_amount_paise: cap },
      });
      setCapDraft(null);
      toast.success(enabled ? `Copilot autopilot on, up to ${formatInr(paise(cap))}.` : "Copilot autopilot off.");
    } catch {
      // executeWithToast already showed the reason.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="autopilot-control">
      <p className="text-[13px] text-text-muted">
        When on, Copilot sends a reminder by itself (simulated, nothing leaves the browser) only if all nine checks
        pass, the amount is within the cap, and an Analyst could approve it. Everything else waits for a person.
        Every send and hold is in the Audit Log as Copilot.
      </p>
      <label className="flex items-center gap-2 text-[13px] font-medium text-text">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-brand)]"
          checked={policy.enabled}
          disabled={!isManager || busy || (!policy.enabled && !capOk)}
          onChange={(e) => void save(e.target.checked, capOk ? capPaise : policy.max_amount_paise)}
          aria-describedby={`${id}-who`}
        />
        Let Copilot send low-risk reminders
      </label>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (capOk) void save(policy.enabled, capPaise);
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-cap`} className="text-[13px] font-medium text-text">
            Largest reminder Copilot may send (₹)
          </label>
          <input
            id={`${id}-cap`}
            inputMode="numeric"
            value={capRupees}
            disabled={!isManager || busy}
            onChange={(e) => setCapDraft(e.target.value.trim())}
            aria-invalid={!capOk}
            aria-describedby={`${id}-cap-hint`}
            className="min-h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] tabular-nums text-text sm:w-48"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={!isManager || busy || !capOk || capPaise === policy.max_amount_paise}
        >
          {busy ? "Saving…" : "Save cap"}
        </Button>
      </form>
      <p id={`${id}-cap-hint`} className={capOk ? "text-[13px] text-text-muted" : "text-[13px] text-high"}>
        {capOk
          ? `Whole rupees, up to ${formatInr(MAX_AUTOPILOT_CAP)} (the Analyst approval limit).`
          : `Enter a whole amount from ₹1 to ${formatInr(MAX_AUTOPILOT_CAP)}.`}
      </p>
      <p id={`${id}-who`} className="text-[13px] text-text-muted">
        {isManager ? "You’re signed in as Manager." : "Only a Manager can change Copilot autopilot."}
      </p>
    </div>
  );
}
