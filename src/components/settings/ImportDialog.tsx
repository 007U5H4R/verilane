"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { IMPORT_KINDS, type ImportKind } from "@/domain/commandConstants";
import {
  checkFile,
  countDataRows,
  formatBytes,
  summarizeImport,
  type ImportSummary,
} from "@/domain/settings/importPreview";
import { cn } from "@/lib/cn";
import { useOnline } from "@/lib/useOnline";
import type { RowError } from "@/store/csv";
import type { VerilaneDb } from "@/store/db";

const KIND_LABEL: Record<ImportKind, string> = {
  invoices: "Invoices",
  customers: "Customers",
  payments: "Payments",
};

/** The file the user picked, read and checked against the real parser. */
type Picked =
  | { kind: "invalid-file"; name: string; size: number; reason: string }
  | { kind: "checked"; name: string; size: number; text: string; summary: ImportSummary; errors: RowError[] };

type Outcome =
  | { kind: "idle" }
  | { kind: "rejected"; fileName: string; errors: RowError[] }
  | { kind: "accepted"; fileName: string; table: ImportKind; count: number; at: Date };

const STAMP = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

/**
 * CSV import (TKT-14, TASK-38). Picking a file runs the same `parseImport()`
 * the import uses, so the preview shows exactly what would happen. A file with
 * any invalid row is rejected whole (and the rejection is audited, as before);
 * a valid file asks for confirmation, then replaces the table through the
 * audited `importCsv()` command. Success is shown only after that write.
 */
export function ImportDialog({ db }: { db: VerilaneDb }) {
  const kindId = useId();
  const fileId = useId();
  const fileLabelId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  // Guards against a slow read of an older file landing after a newer pick.
  const pickToken = useRef(0);
  const [kind, setKind] = useState<ImportKind>("invoices");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [currentRows, setCurrentRows] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const online = useOnline();

  function clearFile() {
    pickToken.current++;
    setPicked(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pick(file: File | undefined, forKind: ImportKind = kind) {
    if (!file || busy) return;
    const token = ++pickToken.current;
    setOutcome({ kind: "idle" });
    const reason = checkFile(file);
    if (reason) {
      setPicked({ kind: "invalid-file", name: file.name, size: file.size, reason });
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      if (token !== pickToken.current) return;
      // TASK-40: the parser and the import command load when a file is picked,
      // not in the Settings first load.
      const [{ parseImport }, { importCsv }] = await Promise.all([
        import("@/store/csv"),
        import("@/store/dataCommands"),
      ]);
      if (token !== pickToken.current) return;
      const parsed = parseImport(forKind, text);
      const errors = parsed.ok ? [] : parsed.error;
      setPicked({
        kind: "checked",
        name: file.name,
        size: file.size,
        text,
        summary: summarizeImport(countDataRows(text), errors),
        errors,
      });
      // A rejected file is still recorded in the audit log, as it always was.
      if (!parsed.ok && online) {
        const result = await importCsv(db, forKind, file.name, text);
        if (token !== pickToken.current) return;
        if (!result.ok) setOutcome({ kind: "rejected", fileName: file.name, errors: result.error });
      } else if (!parsed.ok) {
        setOutcome({ kind: "rejected", fileName: file.name, errors });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t read that file. Nothing was changed.");
    } finally {
      if (token === pickToken.current) setReading(false);
    }
  }

  const ready = picked?.kind === "checked" && picked.errors.length === 0 && picked.summary.total > 0;

  async function openConfirm() {
    if (!ready || busy) return;
    setCurrentRows(null);
    setConfirmOpen(true);
    try {
      setCurrentRows(await db[kind].count());
    } catch {
      setCurrentRows(null);
    }
  }

  async function confirmImport() {
    if (picked?.kind !== "checked" || busy) return;
    setBusy(true);
    try {
      const { importCsv } = await import("@/store/dataCommands");
      const result = await importCsv(db, kind, picked.name, picked.text);
      if (result.ok) {
        const count = result.value.rows.length;
        setOutcome({ kind: "accepted", fileName: picked.name, table: kind, count, at: new Date() });
        toast.success(`Imported ${count} ${KIND_LABEL[kind].toLowerCase()}.`);
        setConfirmOpen(false);
        clearFile();
      } else {
        setOutcome({ kind: "rejected", fileName: picked.name, errors: result.error });
        setConfirmOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The import failed. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <form
        aria-label="Import CSV"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void openConfirm();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={kindId} className="text-[13px] font-medium text-text">
            Table
          </label>
          <select
            id={kindId}
            value={kind}
            disabled={busy}
            onChange={(e) => {
              // The preview belongs to one table, so a new table needs a new pick.
              setKind(e.target.value as ImportKind);
              clearFile();
              setOutcome({ kind: "idle" });
            }}
            className="min-h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text sm:w-56"
          >
            {IMPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span id={fileLabelId} className="text-[13px] font-medium text-text">
            CSV file
          </span>
          <input
            id={fileId}
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            aria-labelledby={fileLabelId}
            disabled={busy}
            className="peer sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <label
            htmlFor={fileId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-border-strong bg-surface-sunken px-4 py-4 text-center text-[13px] text-text-muted transition-colors hover:border-brand",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
              dragging && "border-brand bg-brand-tint",
            )}
          >
            <Upload aria-hidden className="size-5 text-brand" />
            <span>
              <span className="font-medium text-brand">Choose file</span> or drag a .csv here
            </span>
            <span className="text-xs">Up to 5 MB</span>
          </label>
        </div>

        {picked && <FilePreview picked={picked} reading={reading} />}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={!ready || busy || reading || !online}>
            {busy ? "Importing…" : "Import"}
          </Button>
          {picked && !busy && (
            <Button type="button" size="sm" variant="ghost" onClick={clearFile}>
              Clear
            </Button>
          )}
        </div>
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
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-low/40 bg-low-bg px-3 py-2 text-[13px] text-text"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-low" />
          <p>
            Imported {outcome.count} rows from {outcome.fileName}. Priorities were recomputed.{" "}
            <span className="text-text-muted">
              {KIND_LABEL[outcome.table]} · {STAMP.format(outcome.at)}
            </span>
          </p>
        </div>
      )}
      {outcome.kind === "rejected" && <ImportErrors fileName={outcome.fileName} errors={outcome.errors} />}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace {KIND_LABEL[kind].toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every row in the {KIND_LABEL[kind]} table is replaced by this file, and priorities are recomputed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {picked?.kind === "checked" && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border bg-surface-sunken px-3 py-2 text-[13px]">
              <dt className="text-text-muted">Table</dt>
              <dd className="text-text">{KIND_LABEL[kind]}</dd>
              <dt className="text-text-muted">File</dt>
              <dd className="min-w-0 break-all text-text">{picked.name}</dd>
              <dt className="text-text-muted">Rows to import</dt>
              <dd className="tabular-nums text-text">{picked.summary.valid}</dd>
              <dt className="text-text-muted">Rows replaced</dt>
              <dd className="tabular-nums text-text">{currentRows ?? "…"}</dd>
            </dl>
          )}
          <p className="flex items-start gap-2 text-[13px] text-text">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-med" />
            The current rows can’t be recovered except by resetting the demo data.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button type="button" onClick={() => void confirmImport()} disabled={busy}>
              {busy ? "Importing…" : "Confirm import"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilePreview({ picked, reading }: { picked: Picked; reading: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[13px]">
      <div className="flex min-w-0 items-center gap-2">
        <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 truncate font-medium text-text">{picked.name}</span>
        <span className="shrink-0 tabular-nums text-text-muted">{formatBytes(picked.size)}</span>
      </div>
      {picked.kind === "invalid-file" ? (
        <p role="alert" className="text-high">
          {picked.reason}
        </p>
      ) : reading ? (
        <p className="text-text-muted">Checking…</p>
      ) : (
        <div aria-live="polite" className="flex flex-col gap-1">
          <ul aria-label="Import preview" className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
            <li className="text-text">
              <span className="text-text-muted">Rows</span> {picked.summary.total}
            </li>
            <li className="text-text">
              <span className="text-text-muted">Valid</span> {picked.summary.valid}
            </li>
            <li className={picked.summary.invalid > 0 ? "font-medium text-high" : "text-text"}>
              <span className="font-normal text-text-muted">Invalid</span> {picked.summary.invalid}
            </li>
          </ul>
          <p className="text-text-muted">
            {picked.errors.length > 0
              ? "This file can’t be imported. The problems are listed below."
              : picked.summary.total === 0
                ? "This file has no data rows."
                : "Every row is valid. Import to review and confirm."}
          </p>
        </div>
      )}
    </div>
  );
}

function ImportErrors({ fileName, errors }: { fileName: string; errors: RowError[] }) {
  return (
    <div role="alert" data-testid="import-errors" className="flex flex-col gap-2 rounded-md border border-high/40 bg-high-bg p-3">
      <p className="text-[13px] font-semibold text-text">
        {fileName} was rejected. Nothing was imported. Fix {errors.length === 1 ? "this problem" : `these ${errors.length} problems`} and try again.
      </p>
      <div className="max-h-64 overflow-auto">
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
