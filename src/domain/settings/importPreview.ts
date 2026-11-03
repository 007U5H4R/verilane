/**
 * Pre-import checks and the preview summary on Settings (TASK-38). Validation
 * itself stays in `parseImport()` (src/store/csv.ts): the component runs it
 * and hands the result here, so the preview and the real import can never
 * disagree about which rows are bad. This module only adds the cheap file
 * checks that come before reading (type, size) and the row counts.
 */
import Papa from "papaparse";
import type { RowError } from "@/store/csv";

/** Largest file the browser import accepts (the seed tables are a few KB). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const CSV_TYPES = new Set(["text/csv", "application/vnd.ms-excel", "text/plain", ""]);

export interface FileFacts {
  name: string;
  size: number;
  type: string;
}

/** A reason the file can't be imported before it is even read, or `null`. */
export function checkFile(file: FileFacts): string | null {
  if (!/\.csv$/i.test(file.name) || !CSV_TYPES.has(file.type)) {
    return `${file.name} is not a CSV file. Choose a .csv file.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_IMPORT_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_IMPORT_BYTES)}.`;
  }
  return null;
}

/** Data rows in `text`, counted with the same options `parseImport()` uses. */
export function countDataRows(text: string): number {
  return Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => h.trim(),
  }).data.length;
}

export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  /** File-level problems (missing columns, no rows) — no row can be valid. */
  fileErrors: number;
}

/**
 * Row counts for the preview. With any file-level error every row is
 * counted invalid, because the whole file is rejected either way.
 */
export function summarizeImport(total: number, errors: readonly RowError[]): ImportSummary {
  const fileErrors = errors.filter((e) => e.row === null).length;
  if (fileErrors > 0) return { total, valid: 0, invalid: total, fileErrors };
  const badRows = new Set(errors.map((e) => e.row)).size;
  return { total, valid: Math.max(0, total - badRows), invalid: badRows, fileErrors: 0 };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
