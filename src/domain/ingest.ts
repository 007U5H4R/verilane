/**
 * Turns raw, CSV-shaped rows (and raw email JSON) into the domain's typed
 * entities (schema.ts), raising a `DataIssue` for anything the raw data gets
 * wrong rather than silently guessing (Data-Model.md: "missing is explicit").
 */
import {
  CustomerSchema,
  EmailMessageSchema,
  InvoiceSchema,
  InvoiceStatusSchema,
  PaymentSchema,
  type Customer,
  type DataIssue,
  type DataIssueKind,
  type EmailMessage,
  type Invoice,
  type InvoiceStatus,
  type Payment,
} from "./schema";

/** A raw CSV row: Papa Parse's header-mode shape, before any domain parsing. */
export type Row = Record<string, string>;

export interface IngestInput {
  invoices: Row[];
  customers: Row[];
  payments: Row[];
  emails: unknown;
}

export interface IngestResult {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  emails: EmailMessage[];
  dataIssues: DataIssue[];
}

/** A row field, defaulted to `""` — `Row` is an index type, so a key may be absent. */
function field(row: Row, key: string): string {
  return row[key] ?? "";
}

/** The field's value, or `null` if blank (the convention for a missing source field). */
function nullableField(row: Row, key: string): string | null {
  const value = field(row, key).trim();
  return value === "" ? null : value;
}

const KNOWN_STATUSES = new Set(InvoiceStatusSchema.options.map((s) => s.toLowerCase()));

function normalizeStatus(statusRaw: string): InvoiceStatus {
  const lower = statusRaw.trim().toLowerCase();
  return KNOWN_STATUSES.has(lower) ? (lower as InvoiceStatus) : "unknown";
}

function addIssue(
  dataIssues: DataIssue[],
  recordId: string,
  fieldName: string,
  kind: DataIssueKind,
  message: string,
  suggestedAction: string,
): void {
  dataIssues.push({
    issue_id: `${recordId}:${fieldName}:${dataIssues.length}`,
    record_id: recordId,
    field: fieldName,
    kind,
    message,
    suggested_action: suggestedAction,
  });
}

function ingestCustomers(rows: Row[]): Customer[] {
  return rows.map((row) =>
    CustomerSchema.parse({
      customer_id: field(row, "customer_id"),
      name: field(row, "name"),
      contact_emails: field(row, "contact_emails")
        .split(";")
        .map((email) => email.trim())
        .filter(Boolean),
      payment_terms_days: Number.parseInt(field(row, "payment_terms_days"), 10),
      segment: field(row, "segment"),
    }),
  );
}

function ingestPayments(rows: Row[]): Payment[] {
  return rows.map((row) =>
    PaymentSchema.parse({
      payment_id: field(row, "payment_id"),
      invoice_id: field(row, "invoice_id"),
      paid_on: field(row, "paid_on"),
      amount_paise: Number.parseInt(field(row, "amount_paise"), 10),
    }),
  );
}

function ingestInvoices(
  rows: Row[],
  paymentsByInvoice: Map<string, number>,
  dataIssues: DataIssue[],
): Invoice[] {
  return rows.map((row) => {
    const invoiceId = field(row, "invoice_id");

    // FS1: a blank invoice_number is explicit missing data, not "".
    const invoiceNumber = nullableField(row, "invoice_number");
    if (invoiceNumber === null) {
      addIssue(
        dataIssues,
        invoiceId,
        "invoice_number",
        "missing",
        `Invoice ${invoiceId} has no invoice_number.`,
        "Confirm the invoice number with the customer or source system.",
      );
    }

    // FS2: a blank due_date is explicit missing data, not "".
    const dueDate = nullableField(row, "due_date");
    if (dueDate === null) {
      addIssue(
        dataIssues,
        invoiceId,
        "due_date",
        "missing",
        `Invoice ${invoiceId} has no due_date.`,
        "Derive the due date from invoice_date and the customer's payment terms, or confirm with the source system.",
      );
    }

    const amountPaise = Number.parseInt(field(row, "amount_paise"), 10);
    const paid = paymentsByInvoice.get(invoiceId) ?? 0;
    const derivedOutstanding = amountPaise - paid;

    // FS8: outstanding is always derived (amount − Σpayments); a supplied
    // value that disagrees is a conflict to flag, not a value to trust.
    const suppliedOutstandingRaw = nullableField(row, "outstanding_amount");
    if (suppliedOutstandingRaw !== null) {
      const suppliedOutstanding = Number.parseInt(suppliedOutstandingRaw, 10);
      if (suppliedOutstanding !== derivedOutstanding) {
        addIssue(
          dataIssues,
          invoiceId,
          "outstanding_amount",
          "conflict",
          `Supplied outstanding_amount (${suppliedOutstanding}) disagrees with amount − Σpayments (${derivedOutstanding}).`,
          "Trust the derived outstanding (amount − Σpayments) and flag the source discrepancy for reconciliation.",
        );
      }
    }

    // FS10: an unrecognized status_raw becomes status 'unknown', flagged —
    // never thrown.
    const statusRaw = field(row, "status_raw");
    const status = normalizeStatus(statusRaw);
    if (status === "unknown" && statusRaw.trim().toLowerCase() !== "unknown") {
      addIssue(
        dataIssues,
        invoiceId,
        "status_raw",
        "unparseable",
        `status_raw '${statusRaw}' is not a recognized invoice status.`,
        "Confirm the invoice's true status with the source system.",
      );
    }

    return InvoiceSchema.parse({
      row_id: Number.parseInt(field(row, "row_id"), 10),
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      customer_id: field(row, "customer_id"),
      invoice_date: field(row, "invoice_date"),
      due_date: dueDate,
      amount_paise: amountPaise,
      currency: nullableField(row, "currency"),
      status_raw: statusRaw,
      status,
      billing_period: nullableField(row, "billing_period"),
      po_number: nullableField(row, "po_number"),
    });
  });
}

function ingestEmails(raw: unknown): EmailMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => EmailMessageSchema.parse(entry));
}

export function ingest(raw: IngestInput): IngestResult {
  const dataIssues: DataIssue[] = [];

  const customers = ingestCustomers(raw.customers);
  const payments = ingestPayments(raw.payments);

  const paymentsByInvoice = new Map<string, number>();
  for (const payment of payments) {
    paymentsByInvoice.set(
      payment.invoice_id,
      (paymentsByInvoice.get(payment.invoice_id) ?? 0) + payment.amount_paise,
    );
  }

  const invoices = ingestInvoices(raw.invoices, paymentsByInvoice, dataIssues);
  const emails = ingestEmails(raw.emails);

  return { customers, invoices, payments, emails, dataIssues };
}
