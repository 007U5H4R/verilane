/**
 * Evidence for the Investigation page's *Invoice facts* table (TASK-7.9,
 * Design.md §13). Each fact points back to the exact CSV row + column it
 * came from, so the analyst can check the number against the source.
 */
import { formatInr, paise } from "./money";
import type { Evidence, EvidenceSourceType, Extraction, Invoice } from "./schema";

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

/** Row header for an email fact; `field` may carry an index (`amounts[0]`). */
export function emailFactLabel(field: string, x: Pick<Extraction, "email_class" | "dispute_type">): string {
  switch (field.replace(/\[\d+\]$/, "")) {
    case "email_class":
      return "Class";
    case "dispute_type":
      return "Dispute type";
    case "invoice_refs":
      return "Invoice cited";
    case "amounts":
      return "Amount mentioned";
    case "commitment_date":
      return x.email_class === "commitment" ? "Promised date" : "Claimed paid on";
    case "missing_info":
      return "Asks for";
    case "status":
      return "Extraction";
    default:
      return field;
  }
}

/**
 * Communication evidence for one message's extraction (TASK-12.5): one item
 * per extracted fact, each pointing at `emails.json · <thread> · <token path>`.
 * A rejected extraction yields a single `unsupported` item and no facts.
 */
export function buildEmailEvidence(x: Extraction): Evidence[] {
  const item = (field: string, value: unknown, claim: string): Evidence => ({
    evidence_id: `${x.message_id}:emails.json:${field}`,
    claim_id: `${x.message_id}:${field}`,
    claim_text: claim,
    source_type: "email",
    source_record_id: x.message_id,
    source_row_or_email_id: x.thread_id,
    source_field: field,
    original_value: value,
    validation_status: x.status === "rejected" ? "unsupported" : "verified",
  });

  if (x.status === "rejected") {
    return [item("status", x.rejection_reason ?? null, "Extraction rejected by schema")];
  }

  const out: Evidence[] = [item("email_class", x.email_class, `Email classed as ${x.email_class}`)];
  if (x.dispute_type) {
    out.push(item("dispute_type", x.dispute_type, `Dispute type is ${x.dispute_type}`));
  }
  x.invoice_refs.forEach((ref, i) => out.push(item(`invoice_refs[${i}]`, ref, `Email cites ${ref}`)));
  x.amounts.forEach((a, i) =>
    out.push(item(`amounts[${i}]`, a, `Email mentions ${formatInr(paise(a))}`)),
  );
  if (x.commitment_date) {
    const label = emailFactLabel("commitment_date", x);
    out.push(item("commitment_date", x.commitment_date, `${label} ${x.commitment_date}`));
  }
  x.missing_info.forEach((m, i) => out.push(item(`missing_info[${i}]`, m, `Email asks for ${m}`)));
  return out;
}

const SOURCE_FILES: Record<EvidenceSourceType, string> = {
  invoice: "invoices.csv",
  customer: "customers.csv",
  payment: "payments.csv",
  email: "emails.json",
};

/**
 * The provenance line: `invoices.csv · Row 12 · due_date` for a CSV row,
 * `emails.json · E-007 · amounts[0]` for an email (the thread id is the
 * locator; the field is the extracted token's path).
 */
export function provenanceOf(ev: Evidence): string {
  const locator =
    ev.source_type === "email" ? ev.source_row_or_email_id : `Row ${ev.source_row_or_email_id}`;
  return `${SOURCE_FILES[ev.source_type]} · ${locator} · ${ev.source_field}`;
}
