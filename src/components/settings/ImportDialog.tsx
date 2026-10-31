"use client";

import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IMPORT_KINDS, type ImportKind } from "@/domain/commands";
import type { RowError } from "@/store/csv";
import { importCsv } from "@/store/dataCommands";
import type { VerilaneDb } from "@/store/db";
import { useOnline } from "@/lib/useOnline";

const KIND_LABEL: Record<ImportKind, string> = {
  invoices: "Invoices",
  customers: "Customers",
  payments: "Payments",
};

type Outcome =
  | { kind: "idle" }
  | { kind: "rejected"; fileName: string; errors: RowError[] }
  | { kind: "accepted"; fileName: string; count: number };

/**
 * CSV import (TKT-14): pick a table and a file; the file replaces that table
 * or, if any row is invalid, is rejected whole with a row / field / reason
 * list (TC-057). Both outcomes are audited by `importCsv()`.
 */
export function ImportDialog({ db }: { db: VerilaneDb }) {
  const kindId = useId();
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("invoices");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const online = useOnline();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    try {
      const text = await file.text();
      const result = await importCsv(db, kind, file.name, text);
      if (result.ok) {
        setOutcome({ kind: "accepted", fileName: file.name, count: result.value.rows.length });
        toast.success(`Imported ${result.value.rows.length} ${KIND_LABEL[kind].toLowerCase()}.`);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        setOutcome({ kind: "rejected", fileName: file.name, errors: result.error });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The import failed. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label="Import CSV">
        <div className="flex flex-col gap-1">
          <label htmlFor={kindId} className="text-[13px] font-medium text-text">
            Table
          </label>
          <select
            id={kindId}
            value={kind}
            onChange={(e) => setKind(e.target.value as ImportKind)}
            className="min-h-9 rounded-md border border-border bg-surface px-2 text-text"
          >
            {IMPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={fileId} className="text-[13px] font-medium text-text">
            CSV file
          </label>
          <input
            id={fileId}
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            required
            className="max-w-full text-[13px] text-text file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-text"
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !online}>
          {busy ? "Importing…" : "Import"}
        </Button>
      </form>
      <p className="text-[13px] text-text-muted">
        Replaces every row in the chosen table. A file with any invalid row is rejected whole, so nothing changes.
      </p>
      {!online && (
        <p role="status" data-testid="import-offline-reason" className="text-[13px] text-text-muted">
          Unavailable offline — reconnect to import.
        </p>
      )}
      {outcome.kind === "accepted" && (
        <p role="status" className="text-[13px] text-text">
          Imported {outcome.count} rows from {outcome.fileName}. Priorities were recomputed.
        </p>
      )}
      {outcome.kind === "rejected" && <ImportErrors fileName={outcome.fileName} errors={outcome.errors} />}
    </div>
  );
}

function ImportErrors({ fileName, errors }: { fileName: string; errors: RowError[] }) {
  return (
    <div role="alert" data-testid="import-errors" className="flex flex-col gap-2 rounded-md border border-high/40 bg-surface p-3">
      <p className="text-[13px] font-semibold text-text">
        {fileName} was rejected. Nothing was imported. Fix {errors.length === 1 ? "this problem" : `these ${errors.length} problems`} and try again.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-text-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">Row</th>
              <th scope="col" className="py-1 pr-4 font-medium">Field</th>
              <th scope="col" className="py-1 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="py-1 pr-4 tabular-nums">{e.row ?? "Header"}</td>
                <td className="py-1 pr-4 font-mono text-xs">{e.field}</td>
                <td className="py-1">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
