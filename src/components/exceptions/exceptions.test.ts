/**
 * TC-75.12 — `/exceptions` and `/exceptions/[id]` screen states
 * (Design-TASK-75 §5, §8, §10, §11, §13): loading / empty / error / working,
 * rendered from the presentational parts the routes compose.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paise } from "@/domain/money";
import type { ExceptionRow } from "@/domain/exceptions/list";
import type { Exception, Invoice } from "@/domain/schema";
import type { ExceptionDetail } from "@/store/hooks";
import { ExceptionCards, ExceptionsEmpty, ExceptionsError, ExceptionsLoading } from "./ExceptionCards";
import { ExceptionDetailContent, ExceptionDetailError, allocateBlocker } from "./ExceptionDetailParts";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const row = (over: Partial<ExceptionRow> = {}): ExceptionRow => ({
  id: "RV-PAY-P-012",
  kind: "unallocated_payment",
  kindLabel: "Unallocated payment",
  subject: "P-012 · Kestrel Foods",
  amountPaise: paise(2_500_000),
  status: "open",
  statusLabel: "Open",
  band: "high",
  invoiceId: "INV-F",
  customerId: "C-005",
  invoiceStatus: "open",
  ageing: "31-60",
  muted: false,
  href: "/exceptions/RV-PAY-P-012",
  ...over,
});

describe("/exceptions list states — TC-75.12", () => {
  it("loading: 5–7 skeleton rows", () => {
    const out = html(createElement(ExceptionsLoading));
    expect(out).toContain('data-state="loading"');
    const n = (out.match(/h-16/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(7);
  });

  it("empty: the §13 copy with a way to the Queue", () => {
    const out = html(createElement(ExceptionsEmpty, { filtered: false }));
    expect(out).toContain('data-state="empty"');
    expect(out).toContain("No exceptions to review");
    expect(out).toContain('href="/queue"');
  });

  it("empty after filtering says so, distinct from no data", () => {
    const out = html(createElement(ExceptionsEmpty, { filtered: true }));
    expect(out).toContain('data-state="empty-filtered"');
    expect(out).toContain("No exceptions match these filters");
  });

  it("error: alert with Retry and the §13 copy", () => {
    const out = html(createElement(ExceptionsError, { onRetry: () => {} }));
    expect(out).toContain('role="alert"');
    expect(out).toContain("Error loading exceptions. Retry?");
  });

  it("working: one 64px card per row with Kind / Subject / Amount / Status / Priority / Review", () => {
    const out = html(createElement(ExceptionCards, { rows: [row(), row({ id: "RV-2", href: "/exceptions/RV-2", amountPaise: null, band: null, kindLabel: "Missing information", subject: "No invoice linked" })] }));
    expect(out).toContain('data-state="working"');
    expect((out.match(/data-testid="exception-row"/g) ?? []).length).toBe(2);
    expect(out).toContain("min-h-16");
    for (const s of ["Unallocated payment", "P-012 · Kestrel Foods", "₹25,000.00", "Open", "High", "Missing information"]) {
      expect(out).toContain(s);
    }
    expect(out).toContain("Not available.");
    expect(out).toContain('href="/exceptions/RV-PAY-P-012"');
    expect(out).toContain(">Review<");
  });

  it("disputed / closed rows are muted with the exclusion badge", () => {
    const out = html(createElement(ExceptionCards, { rows: [row({ muted: true, band: "disputed" })] }));
    expect(out).toContain("opacity-60");
    expect(out).toContain("Disputed — excluded from queue");
  });
});

const invoice: Invoice = {
  row_id: 6,
  invoice_id: "INV-F",
  invoice_number: "VL-1006",
  customer_id: "C-005",
  invoice_date: "2026-08-01",
  due_date: "2026-09-15",
  amount_paise: paise(2_500_000),
  currency: "INR",
  status_raw: "open",
  status: "open",
  billing_period: null,
  po_number: null,
};

const exception: Exception = {
  review_id: "RV-PAY-P-012",
  kind: "unallocated_payment",
  payment_id: "P-012",
  candidate_invoice_ids: ["INV-F"],
  linked_review_ids: [],
  recommendation: "Allocate P-012 to INV-F: the amount matches its outstanding exactly.",
  evidence_ids: ["P-012:payments.csv:amount_paise", "P-012:payments.csv:invoice_id"],
  validation_status: "verified",
  escalation_reason: "",
  requires_role: "analyst",
  status: "open",
};

const detail = (over: Partial<ExceptionDetail> = {}): ExceptionDetail => ({
  exception,
  payment: { payment_id: "P-012", invoice_id: null, paid_on: "2026-10-28", amount_paise: paise(2_500_000) },
  candidates: [
    {
      invoice,
      customer: { customer_id: "C-005", name: "Kestrel Foods", contact_emails: [], payment_terms_days: 30, segment: "x" },
      priority: { invoice_id: "INV-F", config_version: "v1", band: "high", factors: [], reason: "", recommended_action: "", days_overdue: 45 },
      outstandingPaise: paise(2_500_000),
    },
  ],
  audit: [],
  unappliedCashPaise: paise(2_500_000),
  unappliedCount: 1,
  ...over,
});

const ALLOWED = { allowed: true } as const;
const content = (d: ExceptionDetail, extra: Record<string, unknown> = {}) =>
  html(
    createElement(ExceptionDetailContent, {
      detail: d,
      selected: "INV-F",
      onSelect: () => {},
      permission: ALLOWED,
      busy: false,
      onSubmit: () => {},
      ...extra,
    }),
  );

describe("/exceptions/[id] — TC-75.12", () => {
  it("error: alert with the §13 copy", () => {
    const out = html(createElement(ExceptionDetailError, { onRetry: () => {} }));
    expect(out).toContain('role="alert"');
    expect(out).toContain("Error loading exception. Retry?");
  });

  it("payment evidence: bank line with provenance, remittance, and total unapplied cash (M1)", () => {
    const out = content(detail());
    expect(out).toContain('data-state="working"');
    expect(out).toContain("P-012");
    expect(out).toContain("28 Oct 2026");
    expect(out).toContain("₹25,000.00");
    expect(out).toContain("Unapplied");
    expect(out).toContain("Source: payments.csv · Row: P-012 · Field: amount_paise");
    expect(out).toMatch(/Remittance/);
    expect(out).toContain("Unapplied cash on the ledger: ₹25,000.00 across 1 bank line");
  });

  it("invoice facts for each candidate: id, customer, outstanding, days overdue", () => {
    const out = content(detail());
    expect(out).toContain("VL-1006");
    expect(out).toContain("Kestrel Foods");
    expect(out).toContain("45 days overdue");
    expect(out).toContain('href="/invoices/INV-F"');
  });

  it("audit trail newest first; empty says so", () => {
    expect(content(detail())).toContain("No actions yet.");
    const out = content(
      detail({
        audit: [
          { event_id: 9, action: "allocate_payment", subject: "review:RV-PAY-P-012", summary: "Allocated payment P-012 (₹25,000.00) to INV-F", at: "2026-10-30T10:00:00Z", actor_label: "Analyst" },
          { event_id: 3, action: "x", subject: "review:RV-PAY-P-012", summary: "Earlier event", at: "2026-10-29T10:00:00Z", actor_label: "Analyst" },
        ],
      }),
    );
    expect(out.indexOf("Allocated payment P-012")).toBeLessThan(out.indexOf("Earlier event"));
  });

  it("action bar: Submit enabled for an open item with a chosen candidate; Mark disputed disabled with its reason", () => {
    const out = content(detail());
    expect(out).toMatch(/<button[^>]*data-testid="exception-submit"(?![^>]*disabled)[^>]*>/);
    expect(out).toContain("Submit for approval");
    expect(out).toMatch(/<button[^>]*disabled[^>]*>Mark disputed/);
  });

  it("disabled reasons: Already resolved / Manager approval required / Choose an invoice", () => {
    const d = detail();
    expect(allocateBlocker(d, "INV-F", ALLOWED)).toBeNull();
    expect(allocateBlocker(detail({ exception: { ...exception, status: "actioned" } }), "INV-F", ALLOWED)).toBe("Already resolved");
    expect(allocateBlocker(d, "INV-F", { allowed: false, reason: "This item was escalated to a Manager." })).toBe("Manager approval required");
    expect(allocateBlocker(d, null, ALLOWED)).toBe("Choose an invoice");
    const out = content(detail({ exception: { ...exception, status: "actioned" } }));
    expect(out).toContain("Already resolved");
    expect(out).toMatch(/<button[^>]*data-testid="exception-submit"[^>]*disabled/);
  });
});
