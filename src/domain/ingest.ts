/**
 * Turns raw, CSV-shaped rows (and raw email JSON) into the domain's typed
 * entities (schema.ts), raising a `DataIssue` for anything the raw data gets
 * wrong rather than silently guessing (Data-Model.md: "missing is explicit").
 */
import type { z } from "zod";
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

/** `{ [key]: value }` when the cell is non-blank, else `{}`: an optional field stays absent (EXE160). */
function optionalField<K extends string>(row: Row, key: K): Partial<Record<K, string>> {
  const value = nullableField(row, key);
  return value === null ? {} : ({ [key]: value } as Record<K, string>);
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

/** A whole number, or NaN — stricter than parseInt, which reads "12abc" as 12. */
function strictInt(raw: string): number {
  const value = raw.trim();
  return /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * R9: validate one row; on failure record an `invalid` DataIssue naming the
 * first bad field and return `null` so the caller skips the row. Ingest
 * never throws on bad data — one malformed line must not sink the load.
 */
function validRow<T>(
  schema: z.ZodType<T>,
  candidate: unknown,
  recordId: string,
  dataIssues: DataIssue[],
): T | null {
  const parsed = schema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  const fieldName = first && first.path.length > 0 ? String(first.path[0]) : "(row)";
  addIssue(
    dataIssues,
    recordId,
    fieldName,
    "invalid",
    `Record ${recordId} was skipped: ${fieldName} ${first?.message ?? "is invalid"}.`,
    "Correct the source row and re-import it.",
  );
  return null;
}

function isPresent<T>(x: T | null): x is T {
  return x !== null;
}

function ingestCustomers(rows: Row[], dataIssues: DataIssue[]): Customer[] {
  return rows
    .map((row) => {
      const candidate = {
        customer_id: field(row, "customer_id"),
        name: field(row, "name"),
        contact_emails: field(row, "contact_emails")
          .split(";")
          .map((email) => email.trim())
          .filter(Boolean),
        payment_terms_days: strictInt(field(row, "payment_terms_days")),
        segment: field(row, "segment"),
      };
      return validRow(CustomerSchema, candidate, candidate.customer_id, dataIssues);
    })
    .filter(isPresent);
}

function ingestPayments(rows: Row[], dataIssues: DataIssue[]): Payment[] {
  return rows
    .map((row) => {
      const candidate = {
        payment_id: field(row, "payment_id"),
        // Blank = unapplied cash (EXE122/EXE123), never "".
        invoice_id: nullableField(row, "invoice_id"),
        paid_on: field(row, "paid_on"),
        amount_paise: strictInt(field(row, "amount_paise")),
        ...optionalField(row, "payer_customer_id"),
        ...optionalField(row, "remittance_reference"),
      };
      return validRow(PaymentSchema, candidate, candidate.payment_id, dataIssues);
    })
    .filter(isPresent);
}

function ingestInvoices(
  rows: Row[],
  paymentsByInvoice: Map<string, number>,
  dataIssues: DataIssue[],
): Invoice[] {
  const seenNumbers = new Map<string, string>();
  const invoices: Invoice[] = [];
  for (const row of rows) {
    const invoiceId = field(row, "invoice_id");
    // This row's issues; kept only if the row itself validates (R9).
    const rowIssues: DataIssue[] = [];

    // FS1: a blank invoice_number is explicit missing data, not "".
    let invoiceNumber = nullableField(row, "invoice_number");
    // invoice_number is unique when present (Data-Model §5): a repeat is a
    // conflict, and the later row's number is dropped so the store's
    // `&invoice_number` index never sees two rows with one number.
    const firstHolder = invoiceNumber === null ? undefined : seenNumbers.get(invoiceNumber);
    if (invoiceNumber !== null && firstHolder !== undefined) {
      addIssue(
        rowIssues,
        invoiceId,
        "invoice_number",
        "conflict",
        `invoice_number '${invoiceNumber}' is already used by invoice ${firstHolder}.`,
        "Confirm the correct invoice number with the source system; one of the two rows is mis-numbered or a duplicate.",
      );
      invoiceNumber = null;
    } else if (invoiceNumber === null) {
      addIssue(
        rowIssues,
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
        rowIssues,
        invoiceId,
        "due_date",
        "missing",
        `Invoice ${invoiceId} has no due_date.`,
        "Derive the due date from invoice_date and the customer's payment terms, or confirm with the source system.",
      );
    }

    const amountPaise = strictInt(field(row, "amount_paise"));
    const paid = paymentsByInvoice.get(invoiceId) ?? 0;
    const derivedOutstanding = amountPaise - paid;

    // FS8: outstanding is always derived (amount − Σpayments); a supplied
    // value that disagrees is a conflict to flag, not a value to trust.
    const suppliedOutstandingRaw = nullableField(row, "outstanding_amount");
    if (suppliedOutstandingRaw !== null) {
      const suppliedOutstanding = strictInt(suppliedOutstandingRaw);
      if (suppliedOutstanding !== derivedOutstanding) {
        addIssue(
          rowIssues,
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
        rowIssues,
        invoiceId,
        "status_raw",
        "unparseable",
        `status_raw '${statusRaw}' is not a recognized invoice status.`,
        "Confirm the invoice's true status with the source system.",
      );
    }

    const candidate = {
      row_id: strictInt(field(row, "row_id")),
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
    };
    const invoice = validRow(InvoiceSchema, candidate, invoiceId, dataIssues);
    // A skipped row neither claims its invoice_number nor keeps its field
    // issues: the `invalid` issue is the one thing to fix first.
    if (invoice === null) continue;
    if (invoice.invoice_number !== null) seenNumbers.set(invoice.invoice_number, invoiceId);
    for (const { record_id, field: f, kind, message, suggested_action } of rowIssues) {
      addIssue(dataIssues, record_id, f, kind, message, suggested_action);
    }
    invoices.push(invoice);
  }
  return invoices;
}

function ingestEmails(raw: unknown, dataIssues: DataIssue[]): EmailMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: unknown, i) => {
      const messageId = (entry as { message_id?: unknown } | null)?.message_id;
      const id = typeof messageId === "string" ? messageId : `emails[${i}]`;
      return validRow(EmailMessageSchema, entry, id, dataIssues);
    })
    .filter(isPresent);
}

export function ingest(raw: IngestInput): IngestResult {
  const dataIssues: DataIssue[] = [];

  const customers = ingestCustomers(raw.customers, dataIssues);
  const payments = ingestPayments(raw.payments, dataIssues);

  const paymentsByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (payment.invoice_id === null) continue; // unapplied cash pays no invoice (TASK-79.1)
    paymentsByInvoice.set(
      payment.invoice_id,
      (paymentsByInvoice.get(payment.invoice_id) ?? 0) + payment.amount_paise,
    );
  }

  const invoices = ingestInvoices(raw.invoices, paymentsByInvoice, dataIssues);
  const emails = ingestEmails(raw.emails, dataIssues);

  return { customers, invoices, payments, emails, dataIssues };
}
