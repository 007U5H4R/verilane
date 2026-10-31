import { describe, expect, it } from "vitest";
import { buildInvoiceEvidence, provenanceOf } from "./evidence";
import { EvidenceSchema, type Invoice } from "./schema";

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    row_id: 12,
    invoice_id: "INV-A",
    invoice_number: "1001",
    customer_id: "C-001",
    invoice_date: "2026-01-01",
    due_date: "2026-09-13",
    amount_paise: 34_000_000,
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
    ...overrides,
  };
}

// TC-010 (unit half): every Invoice-facts value carries invoices.csv · Row N · field.
describe("buildInvoiceEvidence", () => {
  it("returns one schema-valid Evidence per invoice fact, in display order", () => {
    const evidence = buildInvoiceEvidence(baseInvoice(), 12);
    expect(evidence.map((e) => e.source_field)).toEqual([
      "invoice_number",
      "invoice_date",
      "due_date",
      "amount_paise",
      "currency",
      "status_raw",
    ]);
    for (const e of evidence) {
      expect(EvidenceSchema.safeParse(e).success).toBe(true);
      expect(e.source_type).toBe("invoice");
      expect(e.source_record_id).toBe("INV-A");
      expect(e.source_row_or_email_id).toBe("12");
    }
  });

  it("uses the row number it is given and keeps the original CSV value", () => {
    const evidence = buildInvoiceEvidence(baseInvoice(), 3);
    const due = evidence.find((e) => e.source_field === "due_date");
    expect(due?.source_row_or_email_id).toBe("3");
    expect(due?.original_value).toBe("2026-09-13");
    expect(due?.validation_status).toBe("verified");
  });

  it("marks a null field as missing (FS1, FS2)", () => {
    const evidence = buildInvoiceEvidence(baseInvoice({ invoice_number: null, due_date: null }), 4);
    const byField = new Map(evidence.map((e) => [e.source_field, e]));
    expect(byField.get("invoice_number")?.validation_status).toBe("missing");
    expect(byField.get("invoice_number")?.original_value).toBeNull();
    expect(byField.get("due_date")?.validation_status).toBe("missing");
    expect(byField.get("amount_paise")?.validation_status).toBe("verified");
  });

  it("gives every item a unique, stable evidence_id", () => {
    const a = buildInvoiceEvidence(baseInvoice(), 12);
    const b = buildInvoiceEvidence(baseInvoice(), 12);
    expect(new Set(a.map((e) => e.evidence_id)).size).toBe(a.length);
    expect(a.map((e) => e.evidence_id)).toEqual(b.map((e) => e.evidence_id));
  });
});

describe("provenanceOf", () => {
  it("formats an invoice fact as `invoices.csv · Row N · field`", () => {
    const due = buildInvoiceEvidence(baseInvoice(), 12).find((e) => e.source_field === "due_date");
    expect(due && provenanceOf(due)).toBe("invoices.csv · Row 12 · due_date");
  });
});
