/**
 * TKT-75.06 · TC-75.35 (component half): the Manager-only "Reverse
 * allocation" section on `/exceptions/[id]`. Shown only on a resolved,
 * still-applied allocation and only to a role `can()` allows; hidden for an
 * Analyst (no dead control); a reopened, reversed item says so.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paise } from "@/domain/money";
import { can } from "@/domain/permissions";
import type { Exception } from "@/domain/schema";
import type { ExceptionDetail } from "@/store/hooks";
import { canOfferReversal, ReverseAllocationPanel, reversibleAllocation } from "./ReverseAllocationSection";

const resolved: Exception = {
  review_id: "RV-PAY-P-012",
  kind: "unallocated_payment",
  payment_id: "P-012",
  invoice_id: "INV-F",
  candidate_invoice_ids: ["INV-F"],
  linked_review_ids: [],
  recommendation: "",
  evidence_ids: [],
  validation_status: "verified",
  escalation_reason: "",
  requires_role: "analyst",
  status: "actioned",
};

const detail = (x: Partial<Exception> = {}, paymentInvoice: string | null = "INV-F"): ExceptionDetail => ({
  exception: { ...resolved, ...x },
  payment: { payment_id: "P-012", invoice_id: paymentInvoice, paid_on: "2026-10-28", amount_paise: paise(2_500_000) },
  candidates: [],
  audit: [],
  unappliedCashPaise: paise(0),
  unappliedCount: 0,
  shortPaymentInstances: [],
  creditNotes: [],
});

const subject = { kind: "review" as const, id: "RV-PAY-P-012" };
const MANAGER = can("manager", "reverse_allocation", subject);
const ANALYST = can("analyst", "reverse_allocation", subject);

const panel = (d: ExceptionDetail, permission = MANAGER, busy = false) =>
  renderToStaticMarkup(createElement(ReverseAllocationPanel, { detail: d, permission, busy, onRequest: () => {} }));

describe("Reverse allocation section — TC-75.35", () => {
  it("Manager on a resolved, applied allocation: its own section with the control", () => {
    const out = panel(detail());
    expect(out).toContain('data-testid="reverse-allocation"');
    expect(out).toContain("Payment P-012 (₹25,000.00) is applied to INV-F.");
    expect(out).toContain('data-testid="reverse-allocation-open"');
    expect(out).toContain(">Reverse allocation<");
    expect(out).not.toMatch(/disabled=""/);
  });

  it("Analyst: hidden entirely — no dead control", () => {
    expect(ANALYST.allowed).toBe(false);
    expect(panel(detail(), ANALYST)).toBe("");
  });

  it("working: the button shows progress and is disabled", () => {
    const out = panel(detail(), MANAGER, true);
    expect(out).toContain("Reversing…");
    expect(out).toMatch(/disabled=""/);
  });

  it("nothing to reverse: open, dismissed, other kinds, or payment no longer applied", () => {
    expect(panel(detail({ status: "open", invoice_id: undefined }))).toBe("");
    expect(panel(detail({ status: "dismissed" }))).toBe("");
    expect(panel(detail({ kind: "missing_info" }))).toBe("");
    expect(panel(detail({}, null))).toBe("");
    expect(panel(detail({}, "INV-OTHER"))).toBe("");
    expect(reversibleAllocation(detail({}, null))).toBeNull();
    expect(reversibleAllocation(detail())).toEqual({ paymentId: "P-012", invoiceId: "INV-F", amountPaise: 2_500_000 });
  });

  it("after a reversal: the reopened item says it was reversed, for any role", () => {
    const reopened = detail({ status: "open", invoice_id: undefined, reopen_reason: "reversed", reversed: true }, null);
    for (const permission of [MANAGER, ANALYST]) {
      const out = panel(reopened, permission);
      expect(out).toContain('data-testid="reversed-notice"');
      expect(out).toContain("Allocation reversed");
      expect(out).not.toContain('data-testid="reverse-allocation-open"');
    }
  });

  it("the confirm dialog is offered only to a role that may reverse (review r2 m4)", () => {
    expect(canOfferReversal(detail(), MANAGER)).toBe(true);
    expect(canOfferReversal(detail(), ANALYST)).toBe(false);
    expect(canOfferReversal(detail({ status: "open", invoice_id: undefined }), MANAGER)).toBe(false);
    expect(canOfferReversal(detail({}, null), MANAGER)).toBe(false);
  });
});
