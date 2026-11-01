import { describe, expect, it } from "vitest";
import { ingest, type Row } from "./ingest";

function customerRow(overrides: Partial<Row> = {}): Row {
  return {
    customer_id: "C-001",
    name: "Acme Co",
    contact_emails: "ap@acme.test;billing@acme.test",
    payment_terms_days: "30",
    segment: "enterprise",
    ...overrides,
  };
}

function invoiceRow(overrides: Partial<Row> = {}): Row {
  return {
    row_id: "12",
    invoice_id: "INV-001",
    invoice_number: "1001",
    customer_id: "C-001",
    invoice_date: "2026-09-01",
    due_date: "2026-09-30",
    amount_paise: "100000",
    currency: "INR",
    status_raw: "open",
    billing_period: "",
    po_number: "",
    ...overrides,
  };
}

function paymentRow(overrides: Partial<Row> = {}): Row {
  return {
    payment_id: "P-001",
    invoice_id: "INV-001",
    paid_on: "2026-09-10",
    amount_paise: "40000",
    ...overrides,
  };
}

describe("ingest — customers and payments", () => {
  it("parses contact_emails and payment_terms_days", () => {
    const result = ingest({
      invoices: [],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });
    expect(result.customers).toEqual([
      {
        customer_id: "C-001",
        name: "Acme Co",
        contact_emails: ["ap@acme.test", "billing@acme.test"],
        payment_terms_days: 30,
        segment: "enterprise",
      },
    ]);
  });
});

// TC-008: missing fields → null + DataIssue (FS1, FS2).
describe("ingest — TC-008 missing fields", () => {
  it("FS1: a blank invoice_number becomes null plus a missing DataIssue", () => {
    const result = ingest({
      invoices: [invoiceRow({ invoice_number: "" })],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });
    expect(result.invoices[0]?.invoice_number).toBeNull();
    expect(result.dataIssues).toContainEqual(
      expect.objectContaining({
        record_id: "INV-001",
        field: "invoice_number",
        kind: "missing",
      }),
    );
  });

  it("FS2: a blank due_date becomes null plus a missing DataIssue", () => {
    const result = ingest({
      invoices: [invoiceRow({ due_date: "" })],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });
    expect(result.invoices[0]?.due_date).toBeNull();
    expect(result.dataIssues).toContainEqual(
      expect.objectContaining({
        record_id: "INV-001",
        field: "due_date",
        kind: "missing",
      }),
    );
  });
});

// TC-009: outstanding conflict and unknown status (FS8, FS10).
describe("ingest — TC-009 conflict and unknown status", () => {
  it("FS8: a supplied outstanding_amount that disagrees with amount − Σpayments raises a conflict", () => {
    const result = ingest({
      invoices: [invoiceRow({ amount_paise: "100000", outstanding_amount: "99999" })],
      customers: [customerRow()],
      payments: [paymentRow({ amount_paise: "40000" })],
      emails: [],
    });
    // Derived outstanding = 100000 - 40000 = 60000, which disagrees with the
    // supplied 99999.
    expect(result.dataIssues).toContainEqual(
      expect.objectContaining({
        record_id: "INV-001",
        field: "outstanding_amount",
        kind: "conflict",
      }),
    );
  });

  it("does not raise a conflict when the supplied outstanding_amount agrees", () => {
    const result = ingest({
      invoices: [invoiceRow({ amount_paise: "100000", outstanding_amount: "60000" })],
      customers: [customerRow()],
      payments: [paymentRow({ amount_paise: "40000" })],
      emails: [],
    });
    expect(
      result.dataIssues.filter((issue) => issue.field === "outstanding_amount"),
    ).toHaveLength(0);
  });

  it("FS10: an unrecognized status_raw becomes status 'unknown' plus a DataIssue, and never throws", () => {
    const result = ingest({
      invoices: [invoiceRow({ status_raw: "pending-ish" })],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });
    expect(result.invoices[0]?.status).toBe("unknown");
    expect(result.dataIssues).toContainEqual(
      expect.objectContaining({
        record_id: "INV-001",
        field: "status_raw",
      }),
    );
  });

  it("normalizes recognized status_raw values case-insensitively", () => {
    const result = ingest({
      invoices: [invoiceRow({ status_raw: "Partially_Paid" })],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });
    expect(result.invoices[0]?.status).toBe("partially_paid");
  });
});

describe("ingest — TC-013 invoice_number uniqueness", () => {
  it("flags a repeated invoice_number as a conflict and keeps the first row's number", () => {
    const result = ingest({
      invoices: [
        invoiceRow({ row_id: "1", invoice_id: "INV-001", invoice_number: "1001" }),
        invoiceRow({ row_id: "2", invoice_id: "INV-002", invoice_number: "1001" }),
      ],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });

    expect(result.invoices.map((i) => i.invoice_number)).toEqual(["1001", null]);
    expect(result.dataIssues).toEqual([
      expect.objectContaining({
        record_id: "INV-002",
        field: "invoice_number",
        kind: "conflict",
        message: expect.stringContaining("INV-001"),
      }),
    ]);
  });

  it("does not treat several blank invoice_numbers as duplicates of each other", () => {
    const result = ingest({
      invoices: [
        invoiceRow({ row_id: "1", invoice_id: "INV-001", invoice_number: "" }),
        invoiceRow({ row_id: "2", invoice_id: "INV-002", invoice_number: "" }),
      ],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });

    expect(result.dataIssues.map((d) => d.kind)).toEqual(["missing", "missing"]);
  });
});

// R9 (TASK-33): ingest never throws on a bad row — the row is skipped and an
// `invalid` DataIssue names it, so one malformed line can't sink the load.
describe("ingest — R9 a bad row is an invalid DataIssue, never a throw", () => {
  it("skips an invoice with a malformed amount and keeps the good rows", () => {
    const run = () =>
      ingest({
        invoices: [
          invoiceRow({ row_id: "1", invoice_id: "INV-BAD", invoice_number: "9001", amount_paise: "12abc.5x" }),
          invoiceRow({ row_id: "2", invoice_id: "INV-001", invoice_number: "1001" }),
        ],
        customers: [customerRow()],
        payments: [],
        emails: [],
      });
    expect(run).not.toThrow();
    const result = run();
    expect(result.invoices.map((i) => i.invoice_id)).toEqual(["INV-001"]);
    expect(result.dataIssues).toEqual([
      expect.objectContaining({ record_id: "INV-BAD", field: "amount_paise", kind: "invalid" }),
    ]);
  });

  it("skips an invoice with a blank invoice_date, and a skipped row's number is not 'taken'", () => {
    const result = ingest({
      invoices: [
        invoiceRow({ row_id: "1", invoice_id: "INV-BAD", invoice_number: "1001", invoice_date: "" }),
        invoiceRow({ row_id: "2", invoice_id: "INV-001", invoice_number: "1001" }),
      ],
      customers: [customerRow()],
      payments: [],
      emails: [],
    });
    expect(result.invoices.map((i) => [i.invoice_id, i.invoice_number])).toEqual([["INV-001", "1001"]]);
    expect(result.dataIssues).toEqual([
      expect.objectContaining({ record_id: "INV-BAD", field: "invoice_date", kind: "invalid" }),
    ]);
  });

  it("skips a malformed payment or customer row instead of throwing", () => {
    const result = ingest({
      invoices: [],
      customers: [customerRow({ customer_id: "C-BAD", payment_terms_days: "thirty" }), customerRow()],
      payments: [paymentRow({ payment_id: "P-BAD", amount_paise: "" }), paymentRow()],
      emails: [{ not: "an email" }],
    });
    expect(result.customers.map((c) => c.customer_id)).toEqual(["C-001"]);
    expect(result.payments.map((p) => p.payment_id)).toEqual(["P-001"]);
    expect(result.emails).toEqual([]);
    expect(result.dataIssues.map((d) => [d.record_id, d.kind])).toEqual([
      ["C-BAD", "invalid"],
      ["P-BAD", "invalid"],
      ["emails[0]", "invalid"],
    ]);
  });
});
