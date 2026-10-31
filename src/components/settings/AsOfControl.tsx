"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { formatDate } from "@/components/investigation/DocumentCard";
import { Button } from "@/components/ui/button";
import { AS_OF_DATE } from "@/domain/clock";
import { setAsOf } from "@/store/dataCommands";
import type { VerilaneDb } from "@/store/db";
import { useAsOf } from "@/store/hooks";

/**
 * Overrides the demo's "today" (TC-061). Applying it recomputes every
 * priority, so days overdue and the queue order change; the change is audited.
 */
export function AsOfControl({ db }: { db: VerilaneDb }) {
  const inputId = useId();
  const asOf = useAsOf();
  // null = no edit in progress, so the input follows the stored date.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? asOf;
  const [busy, setBusy] = useState(false);

  async function apply(date: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await setAsOf(db, date);
      setDraft(null);
      toast.success(`Priorities recomputed as of ${formatDate(date ?? AS_OF_DATE)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t change the as-of date.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) void apply(value);
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-[13px] font-medium text-text">
            As-of date
          </label>
          <input
            id={inputId}
            type="date"
            value={value}
            required
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-9 rounded-md border border-border bg-surface px-2 text-text"
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !value || value === asOf}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || asOf === AS_OF_DATE}
          onClick={() => void apply(null)}
        >
          Use default ({formatDate(AS_OF_DATE)})
        </Button>
      </form>
      <p className="text-[13px] text-text-muted">
        Currently {formatDate(asOf)}. Days overdue and the queue order are calculated from this date.
      </p>
    </div>
  );
}
