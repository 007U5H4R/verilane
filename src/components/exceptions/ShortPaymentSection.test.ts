/**
 * TKT-75.05 (UI half) · TC-75.28 / TC-75.29 / TC-75.30, Design-TASK-75 §8,
 * §11, §13: the short-payment detail on `/exceptions/[id]`.
 *  - history, total deducted and stated reasons (FS18: a missing reason is
 *    "Needs review", never an assumed deduction type);
 *  - the CreditNote evidence group appears only once a note exists;
 *  - the "Approve write-off" control is Manager-only (hidden for an Analyst);
 *  - muted (written-off) rows use `bg-surface-sunken`, never `opacity-*`
 *    on text (the TASK-88 WCAG 1.4.3 scar).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paise } from "@/domain/money";
import { can } from "@/domain/permissions";
import type { Exception } from "@/domain/schema";
import type { CreditNoteRow } from "@/store/db";
import type { ExceptionDetail } from "@/store/hooks";
import {
  CreditNoteEvidence,
  ShortPaymentSection,
  shortPaymentHistory,
  WriteOffControl,
  writeOffTarget,
} from "./ShortPaymentSection";

const base = {
  recommendation: "",
  evidence_ids: [],
  validation_status: "verified" as const,
  escalation_reason: "",
  requires_role: "manager" as const,
  status: "open" as const,
};

const inst = (n: number, x: Partial<Exception> = {}): Exception => ({
  ...base,
  review_id: `RV-SP-INV-00${n}`,
  kind: "short_payment",
  invoice_id: `INV-00${n}`,
  payment_id: `P-10${n}`,
  customer_id: "C-001",
  deducted_paise: paise(100_000),
  deduction_reason: "Damaged goods",
  linked_review_ids: ["RV-SPP-C-001"],
  ...x,
});

const pattern = (x: Partial<Exception> = {}): Exception => ({
  ...base,
  review_id: "RV-SPP-C-001",
  kind: "short_payment_pattern",
  customer_id: "C-001",
  deducted_paise: paise(300_000),
  linked_review_ids: ["RV-SP-INV-001", "RV-SP-INV-002", "RV-SP-INV-003"],
  escalation_reason: "3 short payments, 3 or more within 90 days, totalling ₹3,000.00",
  ...x,
});

const detail = (exception: Exception, x: Partial<ExceptionDetail> = {}): ExceptionDetail => ({
  exception,
  candidates: [],
  audit: [],
  unappliedCashPaise: paise(0),
  unappliedCount: 0,
  shortPaymentInstances: [],
  creditNotes: [],
  ...x,
});

const patternDetail = (x: Partial<ExceptionDetail> = {}, p: Partial<Exception> = {}) =>
  detail(pattern(p), {
    shortPaymentInstances: [inst(1), inst(2, { deduction_reason: undefined, validation_status: "missing" }), inst(3)],
    ...x,
  });

const note = (invoice: string, x: Partial<CreditNoteRow> = {}): CreditNoteRow => ({
  credit_note_id: `CN-${invoice}`,
  invoice_id: invoice,
  customer_id: "C-001",
  amount_paise: 100_000,
  reason: "Damaged goods",
  approved_by: "manager",
  created_at: "2026-11-04T08:45:00.000Z",
  exception_id: "RV-SPP-C-001",
  ...x,
});

const subject = { kind: "review" as const, id: "RV-SPP-C-001", requires_role: "manager" as const };
const MANAGER = can("manager", "approve_write_off", subject);
const ANALYST = can("analyst", "approve_write_off", subject);

const section = (d: ExceptionDetail) => renderToStaticMarkup(createElement(ShortPaymentSection, { detail: d }));
const notes = (n: CreditNoteRow[]) => renderToStaticMarkup(createElement(CreditNoteEvidence, { creditNotes: n }));
const control = (d: ExceptionDetail, permission = MANAGER, busy = false) =>
  renderToStaticMarkup(createElement(WriteOffControl, { detail: d, permission, busy, onRequest: () => {} }));

describe("shortPaymentHistory — Design §8", () => {
  it("a pattern lists its linked instances and the total deducted", () => {
    const h = shortPaymentHistory(patternDetail());
    expect(h.rows.map((r) => r.invoiceId)).toEqual(["INV-001", "INV-002", "INV-003"]);
    expect(h.totalPaise).toBe(300_000);
    expect(h.rows[1]!.reason).toBeNull();
  });

  it("a standalone instance is its own one-row history", () => {
    const h = shortPaymentHistory(detail(inst(4, { linked_review_ids: [], customer_id: "C-002" })));
    expect(h.rows.map((r) => r.reviewId)).toEqual(["RV-SP-INV-004"]);
    expect(h.totalPaise).toBe(100_000);
    expect(h.patternId).toBeNull();
  });

  it("a patterned instance names its pattern and never lists the pattern row as a payment", () => {
    const h = shortPaymentHistory(detail(inst(1), { shortPaymentInstances: [pattern()] }));
    expect(h.rows.map((r) => r.reviewId)).toEqual(["RV-SP-INV-001"]);
    expect(h.patternId).toBe("RV-SPP-C-001");
  });
});

describe("ShortPaymentSection — history, total, reasons (TC-75.28)", () => {
  it("shows the total deducted as a negative amount and every instance", () => {
    const out = section(patternDetail());
    expect(out).toContain('data-testid="short-payment-history"');
    expect(out).toContain("−₹3,000.00");
    expect(out).toContain("3 short payments");
    for (const id of ["INV-001", "INV-002", "INV-003"]) expect(out).toContain(`href="/invoices/${id}"`);
    expect(out).toContain('href="/exceptions/RV-SP-INV-001"');
  });

  it("shows a stated reason verbatim", () => {
    expect(section(patternDetail())).toContain("Damaged goods");
  });

  it("FS18: a missing reason is “Needs review” with no assumed deduction type", () => {
    const out = section(patternDetail());
    expect(out).toContain("Needs review");
    expect(out).toContain("No reason stated — no deduction type assumed");
    // Exactly one row lacks a reason.
    expect(out.match(/data-testid="short-payment-needs-review"/g)).toHaveLength(1);
  });

  it("carries a provenance line (Design §8 format)", () => {
    expect(section(patternDetail())).toContain("Source: payments.csv · Row: P-101 · Field: amount_paise, deduction_reason");
  });

  it("a written-off row is muted with bg-surface-sunken and a text badge — never opacity (TASK-88)", () => {
    const d = patternDetail(
      {
        shortPaymentInstances: [inst(1, { status: "actioned" }), inst(2, { status: "actioned" }), inst(3, { status: "actioned" })],
        creditNotes: [note("INV-001"), note("INV-002"), note("INV-003")],
      },
      { status: "actioned" },
    );
    const out = section(d);
    expect(out).toContain("bg-surface-sunken");
    expect(out).toContain("Written off");
    expect(out).not.toMatch(/opacity-/);
  });

  it("a patterned instance links to its pattern", () => {
    const out = section(detail(inst(1), { shortPaymentInstances: [pattern()] }));
    expect(out).toContain('href="/exceptions/RV-SPP-C-001"');
  });

  it("empty: a pattern whose instances are gone says so instead of an empty list", () => {
    const out = section(detail(pattern(), { shortPaymentInstances: [] }));
    expect(out).toContain("No short payments are on the ledger for this pattern.");
    expect(out).not.toContain("<li");
  });
});

describe("CreditNoteEvidence — only once a note exists (Design §8)", () => {
  it("renders nothing without a credit note (not a placeholder)", () => {
    expect(notes([])).toBe("");
  });

  it("shows id, amount, reason, approved-by and created-at per note, with provenance", () => {
    const out = notes([note("INV-001")]);
    expect(out).toContain('data-testid="credit-note-evidence"');
    expect(out).toContain("CN-INV-001");
    expect(out).toContain("₹1,000.00");
    expect(out).toContain("Damaged goods");
    expect(out).toContain("Manager");
    expect(out).toContain("Source: creditNotes · Row: CN-INV-001 · Field: amount_paise");
    expect(out).not.toMatch(/opacity-/);
  });
});

describe("writeOffTarget", () => {
  it("an open pattern writes off every open instance's deduction", () => {
    expect(writeOffTarget(patternDetail())).toEqual({ count: 3, totalPaise: 300_000 });
  });

  it("an open standalone instance writes off its own deduction", () => {
    expect(writeOffTarget(detail(inst(4, { linked_review_ids: [] })))).toEqual({ count: 1, totalPaise: 100_000 });
  });

  it("a pattern counts only its still-open instances; one already written off is skipped (EXE155)", () => {
    const d = patternDetail({ shortPaymentInstances: [inst(1), inst(2, { status: "actioned" }), inst(3)] });
    expect(writeOffTarget(d)).toEqual({ count: 2, totalPaise: 200_000 });
  });

  it("a pattern with no open instance left has nothing to write off", () => {
    const closed = { status: "actioned" as const };
    const d = patternDetail({ shortPaymentInstances: [inst(1, closed), inst(2, closed), inst(3, closed)] });
    expect(writeOffTarget(d)).toBeNull();
  });

  it("nothing to write off once closed", () => {
    expect(writeOffTarget(patternDetail({}, { status: "actioned" }))).toBeNull();
  });

  it("a patterned instance is written off from its open pattern, not on its own", () => {
    expect(writeOffTarget(detail(inst(1), { shortPaymentInstances: [pattern()] }))).toBeNull();
  });

  it("not a short-payment kind → null", () => {
    expect(writeOffTarget(detail({ ...inst(1), kind: "unallocated_payment" }))).toBeNull();
  });
});

describe("WriteOffControl — Manager only (TC-75.29 UI)", () => {
  it("Manager on an open pattern: an enabled “Approve write-off” control with the amount", () => {
    const out = control(patternDetail());
    expect(out).toContain('data-testid="approve-write-off"');
    expect(out).toContain("Approve write-off");
    expect(out).not.toMatch(/disabled=""/);
  });

  it("Analyst: hidden entirely — no dead control", () => {
    expect(control(patternDetail(), ANALYST)).toBe("");
  });

  it("busy: disabled and says so", () => {
    const out = control(patternDetail(), MANAGER, true);
    expect(out).toContain("Writing off…");
    expect(out).toMatch(/disabled=""/);
  });

  it("closed: nothing to approve, so no control", () => {
    expect(control(patternDetail({}, { status: "actioned" }))).toBe("");
  });

  it("a patterned instance points the Manager to the pattern instead", () => {
    const out = control(detail(inst(1), { shortPaymentInstances: [pattern()] }));
    expect(out).not.toContain('data-testid="approve-write-off"');
    expect(out).toContain('href="/exceptions/RV-SPP-C-001"');
    expect(out).toContain("Write off from the pattern");
  });

  it("the Analyst sees no pattern hint either (Manager-only control)", () => {
    expect(control(detail(inst(1), { shortPaymentInstances: [pattern()] }), ANALYST)).toBe("");
  });
});
