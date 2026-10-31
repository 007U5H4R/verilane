/**
 * Evidence for the Investigation page's *Invoice facts* table (TASK-7.9,
 * Design.md §13). Each fact points back to the exact CSV row + column it
 * came from, so the analyst can check the number against the source.
 */
import type { Evidence, EvidenceSourceType, Invoice } from "./schema";

// Display order, and each field's claim label. Field names are the
// invoices.csv column names, so the provenance line matches the file.
const INVOICE_FACTS = [
  ["invoice_number", "Invoice number"],
  ["invoice_date", "Invoice date"],
  ["due_date", "Due date"],
  ["amount_paise", "Invoice amount"],
  ["currency", "Currency"],
  ["status_raw", "Status"],
] as const satisfies ReadonlyArray<readonly [keyof Invoice, string]>;

/** `source_field → label` for the Invoice facts table's row headers. */
export const INVOICE_FACT_LABELS: Readonly<Record<string, string>> = Object.fromEntries(INVOICE_FACTS);

/** One `Evidence` per invoice fact; a null value is `missing` (FS1, FS2). */
export function buildInvoiceEvidence(inv: Invoice, rowNo: number): Evidence[] {
  return INVOICE_FACTS.map(([field, label]) => {
    const value = inv[field];
    return {
      evidence_id: `${inv.invoice_id}:invoices.csv:${field}`,
      claim_id: `${inv.invoice_id}:${field}`,
      claim_text: value === null ? `${label} is missing` : `${label} is ${String(value)}`,
      source_type: "invoice",
      source_record_id: inv.invoice_id,
      source_row_or_email_id: String(rowNo),
      source_field: field,
      original_value: value,
      validation_status: value === null ? "missing" : "verified",
    };
  });
}

const SOURCE_FILES: Record<EvidenceSourceType, string> = {
  invoice: "invoices.csv",
  customer: "customers.csv",
  payment: "payments.csv",
  email: "emails.json",
};

/** The provenance line, e.g. `invoices.csv · Row 12 · due_date`. */
export function provenanceOf(ev: Evidence): string {
  const locator = ev.source_type === "email" ? "Email" : "Row";
  return `${SOURCE_FILES[ev.source_type]} · ${locator} ${ev.source_row_or_email_id} · ${ev.source_field}`;
}
