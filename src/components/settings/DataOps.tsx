"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { toCsv, type ExportKind } from "@/store/csv";
import type { VerilaneDb } from "@/store/db";

const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: "invoices", label: "Invoices" },
  { kind: "extractions", label: "Extraction results" },
  { kind: "disputes", label: "Disputes" },
  { kind: "drafts", label: "Drafts" },
  { kind: "audit", label: "Audit log" },
];

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

/** CSV export of the source and workflow tables (TKT-14). */
export function DataOps({ db }: { db: VerilaneDb }) {
  const [busy, setBusy] = useState<ExportKind | null>(null);

  async function exportKind(kind: ExportKind) {
    setBusy(kind);
    try {
      const rows = await rowsFor(db, kind);
      download(`verilane-${kind}.csv`, toCsv(kind, rows));
    } catch {
      toast.error("Couldn’t export that table. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map((e) => (
          <Button
            key={e.kind}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void exportKind(e.kind)}
          >
            {e.label}
          </Button>
        ))}
      </div>
      <p className="text-[13px] text-text-muted">
        Exports are CSV. Amounts are whole paise; cells that look like spreadsheet formulas are escaped.
      </p>
    </div>
  );
}
