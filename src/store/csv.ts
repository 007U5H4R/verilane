/**
 * CSV import / export (TASK-19.1). `parseImport()` is Papa → Zod per row:
 * any problem anywhere rejects the whole file with a row / field / reason
 * list (TC-057), so a half-good file never reaches the database. Accepted
 * rows go through `ingest()`, the same path the seed takes, so missing
 * fields stay explicit (FS1/FS2/FS10) instead of being guessed.
 */
import Papa from "papaparse";
import { z } from "zod";
import type { ImportKind } from "@/domain/commands";
import { ingest, type Row as RawRow } from "@/domain/ingest";
import type { Customer, DataIssue, Invoice, Payment } from "@/domain/schema";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** One reason a file was rejected. `row` is the 1-based data row (the
 * header is not counted); `null` for file-level problems such as a missing
 * column. */
export interface RowError {
  row: number | null;
  field: string;
  reason: string;
}

export interface ImportRows {
  invoices: Invoice[];
  customers: Customer[];
  payments: Payment[];
}

export interface ParsedImport<K extends ImportKind = ImportKind> {
  kind: K;
  rows: ImportRows[K];
  /** Data issues `ingest()` raised for the rows (invoices only). */
  dataIssues: DataIssue[];
}

/** Columns each import must carry (cells may be blank where the domain
 * allows null). `toCsv()` writes exactly these, in this order. */
export const IMPORT_COLUMNS: Record<ImportKind, readonly string[]> = {
  invoices: [
    "row_id",
    "invoice_id",
    "invoice_number",
    "customer_id",
    "invoice_date",
    "due_date",
    "amount_paise",
    "currency",
    "status_raw",
    "billing_period",
    "po_number",
  ],
  customers: ["customer_id", "name", "contact_emails", "payment_terms_days", "segment"],
  payments: ["payment_id", "invoice_id", "paid_on", "amount_paise"],
};

/** Optional columns an import may carry. `toCsv()` writes each one after the
 * required ones only when some row has a value, so the fields survive a round
 * trip and a v1 export is unchanged (EXE160). A file without them still imports. */
const OPTIONAL_COLUMNS: Partial<Record<ImportKind, readonly string[]>> = {
  payments: ["payer_customer_id", "remittance_reference", "deduction_reason"],
};

/** Columns that must be unique within a file (blank cells are exempt); a
 * repeat rejects the file. `invoice_number` is a unique index in the store. */
const UNIQUE_COLUMNS: Record<ImportKind, readonly string[]> = {
  invoices: ["invoice_id", "invoice_number"],
  customers: ["customer_id"],
  payments: ["payment_id"],
};

function isCalendarDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const cell = z.string({ error: "is missing" });
const required = cell.trim().min(1, "is required");
const isoDate = required.refine(isCalendarDate, "must be a real date in YYYY-MM-DD form");
const optionalIsoDate = cell
  .trim()
  .refine((v) => v === "" || isCalendarDate(v), "must be blank or a real date in YYYY-MM-DD form");
const wholeNumber = (what: string) =>
  required.regex(/^\d+$/, `must be a whole number of ${what}, zero or more`);
const optionalWholeNumber = (what: string) =>
  cell
    .trim()
    .regex(/^(-?\d+)?$/, `must be blank or a whole number of ${what}`)
    .optional();

const RAW_SCHEMA: Record<ImportKind, z.ZodType> = {
  invoices: z.object({
    row_id: required.regex(/^[1-9]\d*$/, "must be a positive whole number"),
    invoice_id: cell, // blank = unapplied cash (EXE123)
    invoice_number: cell,
    customer_id: required,
    invoice_date: isoDate,
    due_date: optionalIsoDate,
    amount_paise: wholeNumber("paise"),
    currency: cell,
    status_raw: cell,
    billing_period: cell,
    po_number: cell,
    outstanding_amount: optionalWholeNumber("paise"),
  }),
  customers: z.object({
    customer_id: required,
    name: required,
    contact_emails: cell,
    payment_terms_days: wholeNumber("days"),
    segment: cell,
  }),
  payments: z.object({
    payment_id: required,
    invoice_id: cell, // blank = unapplied cash (EXE123)
    paid_on: isoDate,
    amount_paise: wholeNumber("paise"),
  }),
};

function headerErrors(kind: ImportKind, fields: string[]): RowError[] {
  return IMPORT_COLUMNS[kind]
    .filter((col) => !fields.includes(col))
    .map((col) => ({ row: null, field: col, reason: "Required column is missing from the header." }));
}

/**
 * Parses and validates one import file. Never partially succeeds: either
 * every row is valid and typed, or the result lists every problem found.
 */
export function parseImport<K extends ImportKind>(
  kind: K,
  text: string,
): Result<ParsedImport<K>, RowError[]> {
  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta.fields ?? [];
  const errors: RowError[] = headerErrors(kind, fields);
  const missing = new Set(errors.map((e) => e.field));

  for (const e of parsed.errors) {
    errors.push({
      row: e.row === undefined ? null : e.row + 1,
      field: "(row)",
      reason: e.message,
    });
  }

  if (parsed.data.length === 0) {
    errors.push({ row: null, field: "(file)", reason: "The file has no data rows." });
  }

  const seen = new Map(UNIQUE_COLUMNS[kind].map((col) => [col, new Map<string, number>()]));
  parsed.data.forEach((raw, i) => {
    const row = i + 1;
    const result = RAW_SCHEMA[kind].safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "(row)");
        if (missing.has(field)) continue; // already reported once as a header error
        errors.push({ row, field, reason: `${field} ${issue.message}` });
      }
    }
    for (const [col, values] of seen) {
      const value = (raw[col] ?? "").trim();
      if (value === "") continue;
      const first = values.get(value);
      if (first !== undefined) {
        errors.push({ row, field: col, reason: `${col} '${value}' repeats row ${first}.` });
      } else {
        values.set(value, row);
      }
    }
  });

  if (errors.length > 0) {
    errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
    return { ok: false, error: errors };
  }

  const rows = parsed.data.map((raw) => {
    const trimmed: RawRow = {};
    for (const [k, v] of Object.entries(raw)) trimmed[k] = typeof v === "string" ? v.trim() : "";
    // outstanding_amount is always derived (FS8); an import never trusts it.
    delete trimmed.outstanding_amount;
    return trimmed;
  });
  const ingested = ingest({
    invoices: kind === "invoices" ? rows : [],
    customers: kind === "customers" ? rows : [],
    payments: kind === "payments" ? rows : [],
    emails: [],
  });
  return {
    ok: true,
    value: {
      kind,
      rows: ingested[kind] as ImportRows[K],
      dataIssues: ingested.dataIssues,
    },
  };
}

/** Everything the app can export (TKT-14): the three import kinds plus the
 * workflow / derived tables. */
export type ExportKind = ImportKind | "extractions" | "disputes" | "drafts" | "audit";

function toCell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join(";");
  return JSON.stringify(v);
}

/**
 * Serialises rows to CSV. Import kinds use their fixed column order (so the
 * file re-imports cleanly, TC-059); other kinds use every key seen, in
 * first-seen order. Formula-like strings are escaped for spreadsheet safety.
 */
export function toCsv(kind: ExportKind, rows: readonly object[]): string {
  let fields: string[];
  if (kind === "invoices" || kind === "customers" || kind === "payments") {
    const optional = (OPTIONAL_COLUMNS[kind] ?? []).filter((f) =>
      rows.some((r) => {
        const v = (r as Record<string, unknown>)[f];
        return v !== undefined && v !== null && v !== "";
      }),
    );
    fields = [...IMPORT_COLUMNS[kind], ...optional];
  } else {
    const seen = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
    fields = [...seen];
  }
  const data = rows.map((r) => {
    const rec = r as Record<string, unknown>;
    return fields.map((f) => toCell(rec[f]));
  });
  return Papa.unparse({ fields, data }, { escapeFormulae: true });
}
