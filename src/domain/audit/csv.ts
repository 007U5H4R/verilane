/**
 * TASK-38 · CSV export of the (filtered) audit log. RFC 4180: CRLF line ends,
 * every field quoted, embedded quotes doubled. Spreadsheet formula injection
 * is neutralised by prefixing `'` to any cell that starts with = + - @, a tab
 * or a carriage return. Only the columns below leave the app — no before/after
 * payloads, evidence ids or other metadata.
 */
import type { AuditEntry } from "./view";
import { ACTOR_TYPE_LABEL } from "./classify";

export const CSV_COLUMNS = [
  "event_id",
  "timestamp_utc",
  "actor",
  "actor_role",
  "actor_type",
  "action",
  "action_label",
  "module",
  "subject",
  "invoice_id",
  "summary",
] as const;

const DANGEROUS = /^[=+\-@\t\r]/;

/** Neutralise a cell a spreadsheet would treat as a formula. */
export function guardCell(value: string): string {
  return DANGEROUS.test(value) ? `'${value}` : value;
}

export function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : guardCell(String(value));
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvField).join(",");
}

export function entryCells(e: AuditEntry): (string | number | null)[] {
  return [
    e.id,
    e.atMs === null ? null : new Date(e.atMs).toISOString(),
    e.actor.name,
    e.actor.role,
    ACTOR_TYPE_LABEL[e.actor.type],
    e.action,
    e.meta.label,
    e.moduleLabel,
    e.subject,
    e.invoiceId,
    e.summary,
  ];
}

export function auditCsv(entries: AuditEntry[]): string {
  return [csvRow([...CSV_COLUMNS]), ...entries.map((e) => csvRow(entryCells(e)))].join("\r\n") + "\r\n";
}

/** `verilane-audit-log-YYYY-MM-DD.csv`, the export day in the display zone. */
export function csvFileName(dayKey: string): string {
  return `verilane-audit-log-${dayKey}.csv`;
}
