"use client";

import { Check, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  allSelected,
  EXPORT_DATASETS,
  exportFileName,
  selectedDatasets,
  toggleAll,
  toggleDataset,
} from "@/domain/settings/exportSelection";
import { cn } from "@/lib/cn";
import { toCsv, type ExportKind } from "@/store/csv";
import type { VerilaneDb } from "@/store/db";

async function rowsFor(db: VerilaneDb, kind: ExportKind): Promise<object[]> {
  switch (kind) {
    case "invoices":
      return db.invoices.orderBy("row_id").toArray();
    case "customers":
      return db.customers.toArray();
    case "payments":
      return db.payments.toArray();
    case "extractions":
      return db.extractions.toArray();
    case "disputes":
      return db.disputes.toArray();
    case "drafts":
      return db.drafts.toArray();
    case "audit":
      return db.audit.orderBy("event_id").toArray();
  }
}

function download(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * CSV export of the source and workflow tables (TKT-14, TASK-38): pick one,
 * several or all datasets; each downloads as its own `toCsv()` file.
 */
export function DataOps({ db }: { db: VerilaneDb }) {
  const [selection, setSelection] = useState<ReadonlySet<ExportKind>>(() => new Set(["invoices"]));
  const [busy, setBusy] = useState(false);
  const chosen = selectedDatasets(selection);
  const all = allSelected(selection);

  async function exportSelected() {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    const names = chosen.map((d) => d.label).join(", ");
    toast.info(`Exporting ${names}…`);
    const failed: string[] = [];
    for (const d of chosen) {
      try {
        download(exportFileName(d.kind), toCsv(d.kind, await rowsFor(db, d.kind)));
      } catch {
        failed.push(d.label);
      }
    }
    if (failed.length === 0) {
      toast.success(chosen.length === 1 ? `Exported ${names}.` : `Exported ${chosen.length} CSV files.`);
    } else {
      toast.error(`Couldn’t export ${failed.join(", ")}. Try again.`);
    }
    setBusy(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-2 text-[13px] font-medium text-text">Datasets</legend>
        <div className="flex flex-wrap gap-2">
          {EXPORT_DATASETS.map((d) => {
            const on = selection.has(d.kind);
            return (
              <label
                key={d.kind}
                className={cn(
                  "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                  on ? "border-brand bg-brand-tint text-text" : "border-border bg-surface text-text hover:bg-surface-sunken",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => setSelection((s) => toggleDataset(s, d.kind))}
                />
                <Check aria-hidden className={cn("size-3.5 text-brand", !on && "invisible")} />
                {d.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy || chosen.length === 0} onClick={() => void exportSelected()}>
          <Download aria-hidden />
          {busy ? "Exporting…" : "Export CSV"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setSelection((s) => toggleAll(s))}
        >
          {all ? "Clear selection" : "Select all"}
        </Button>
        <span className="text-[13px] text-text-muted" aria-live="polite">
          {chosen.length === 0 ? "Choose at least one dataset." : `${chosen.length} selected`}
        </span>
      </div>
      <p className="text-[13px] text-text-muted">
        Exports are CSV, one file per dataset. Amounts are whole paise; cells that look like spreadsheet formulas are
        escaped.
      </p>
    </div>
  );
}
