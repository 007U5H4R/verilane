import { describe, expect, it } from "vitest";
import { buildEmailEvidence, buildInvoiceEvidence, emailFactLabel, provenanceOf } from "./evidence";
import { EvidenceSchema, type DataIssue, type Extraction, type Invoice } from "./schema";
import { paise } from "./money";

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    row_id: 12,
    invoice_id: "INV-A",
    invoice_number: "1001",
    customer_id: "C-001",
    invoice_date: "2026-01-01",
    due_date: "2026-09-13",
    amount_paise: paise(34_000_000),
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

  // R10 (TASK-33): ingest nulls a duplicate invoice_number and records a
  // conflict DataIssue; the fact must read Conflict, not Missing.
  it("marks a duplicate-number invoice's number as conflict, not missing (R10)", () => {
    const issues: DataIssue[] = [
      {
        issue_id: "INV-A:invoice_number:0",
        record_id: "INV-A",
        field: "invoice_number",
        kind: "conflict",
        message: "invoice_number '1001' is already used by invoice INV-001.",
        suggested_action: "Confirm the correct invoice number.",
      },
      {
        issue_id: "INV-OTHER:due_date:1",
        record_id: "INV-OTHER",
        field: "due_date",
        kind: "conflict",
        message: "not this invoice",
        suggested_action: "-",
      },
    ];
    const evidence = buildInvoiceEvidence(baseInvoice({ invoice_number: null, due_date: null }), 4, issues);
    const byField = new Map(evidence.map((e) => [e.source_field, e]));
    expect(byField.get("invoice_number")?.validation_status).toBe("conflict");
    expect(byField.get("invoice_number")?.claim_text).toContain("already used by invoice INV-001");
    expect(byField.get("due_date")?.validation_status).toBe("missing");
    for (const e of evidence) expect(EvidenceSchema.safeParse(e).success).toBe(true);
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

  it("formats an email fact as `emails.json · <thread> · <token path>` (TC-025)", () => {
    const amount = buildEmailEvidence(extraction()).find((e) => e.source_field === "amounts[0]");
    expect(amount && provenanceOf(amount)).toBe("emails.json · E-007 · amounts[0]");
  });
});

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    message_id: "E-007-1",
    thread_id: "E-007",
    mode: "simulated",
    provider: "simulated",
    schemaVersion: "extraction.v1",
    email_class: "confirmation",
    signals: ["confirmation"],
    invoice_refs: ["INV-1042"],
    amounts: [30_000_000],
    dates: ["2026-10-27"],
    commitment_date: "2026-10-27",
    payment_claim: { paid_on: "2026-10-27", amount_paise: 30_000_000 },
    missing_info: [],
    status: "valid",
    ...overrides,
  };
}

describe("buildEmailEvidence (TASK-12.5)", () => {
  it("returns one schema-valid, verified item per extracted fact", () => {
    const ev = buildEmailEvidence(extraction());
    expect(ev.map((e) => e.source_field)).toEqual([
      "email_class",
      "invoice_refs[0]",
      "amounts[0]",
      "commitment_date",
    ]);
    for (const e of ev) {
      expect(EvidenceSchema.safeParse(e).success).toBe(true);
      expect(e).toMatchObject({
        source_type: "email",
        source_record_id: "E-007-1",
        source_row_or_email_id: "E-007",
        validation_status: "verified",
      });
    }
    expect(ev.find((e) => e.source_field === "amounts[0]")?.original_value).toBe(30_000_000);
  });

  it("includes dispute type and missing-info items when present", () => {
    const fields = buildEmailEvidence(
      extraction({
        email_class: "dispute",
        dispute_type: "missing_po",
        commitment_date: null,
        missing_info: ["GSTIN"],
      }),
    ).map((e) => e.source_field);
    expect(fields).toContain("dispute_type");
    expect(fields).toContain("missing_info[0]");
    expect(fields).not.toContain("commitment_date");
  });

  it("a rejected extraction yields one unsupported item and no facts", () => {
    const ev = buildEmailEvidence(
      extraction({
        status: "rejected",
        rejection_reason: "schema validation failed",
        email_class: "unknown",
        invoice_refs: [],
        amounts: [],
      }),
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ source_field: "status", validation_status: "unsupported" });
  });

  it("labels the date by what it means", () => {
    expect(emailFactLabel("commitment_date", { email_class: "commitment" })).toBe("Promised date");
    expect(emailFactLabel("commitment_date", { email_class: "confirmation" })).toBe("Claimed paid on");
    expect(emailFactLabel("amounts[2]", { email_class: "confirmation" })).toBe("Amount mentioned");
  });
});
