"use client";

import { CalendarCheck } from "lucide-react";
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

  const pending = draft !== null && draft !== asOf;
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
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
            disabled={busy}
            aria-describedby={pending ? `${inputId}-pending` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text sm:w-48"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy || !value || value === asOf}>
            {busy ? "Applying…" : "Apply"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || asOf === AS_OF_DATE}
            onClick={() => void apply(null)}
          >
            Use default ({formatDate(AS_OF_DATE)})
          </Button>
        </div>
        {pending && (
          <p id={`${inputId}-pending`} className="text-[13px] text-med sm:pb-2">
            Not applied yet — press Apply to recalculate.
          </p>
        )}
      </form>
      <p className="flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 text-[13px] text-text">
        <CalendarCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          Currently {formatDate(asOf)}. Days overdue and the queue order are calculated from this date.
        </span>
      </p>
    </div>
  );
}
