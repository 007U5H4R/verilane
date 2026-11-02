/**
 * Which datasets the Settings export offers, and the selection logic behind
 * its checkboxes (TASK-38). The files themselves are still written by
 * `toCsv()` (src/store/csv.ts), one file per selected dataset.
 */
import type { ExportKind } from "@/store/csv";

export interface ExportDataset {
  kind: ExportKind;
  label: string;
}

/** The datasets the Settings page has always exported, in display order. */
export const EXPORT_DATASETS: readonly ExportDataset[] = [
  { kind: "invoices", label: "Invoices" },
  { kind: "extractions", label: "Extraction results" },
  { kind: "disputes", label: "Disputes" },
  { kind: "drafts", label: "Drafts" },
  { kind: "audit", label: "Audit log" },
];

export type ExportSelection = ReadonlySet<ExportKind>;

export function toggleDataset(selection: ExportSelection, kind: ExportKind): Set<ExportKind> {
  const next = new Set(selection);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  return next;
}

export function allSelected(selection: ExportSelection): boolean {
  return EXPORT_DATASETS.every((d) => selection.has(d.kind));
}

/** "Select all" flips to none when everything is already selected. */
export function toggleAll(selection: ExportSelection): Set<ExportKind> {
  return allSelected(selection) ? new Set() : new Set(EXPORT_DATASETS.map((d) => d.kind));
}

/** Selected datasets in display order (the order files are downloaded). */
export function selectedDatasets(selection: ExportSelection): ExportDataset[] {
  return EXPORT_DATASETS.filter((d) => selection.has(d.kind));
}

export function exportFileName(kind: ExportKind): string {
  return `verilane-${kind}.csv`;
}
