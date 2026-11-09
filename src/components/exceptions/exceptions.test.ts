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
import { Rejected, ok } from "@/domain/result";
import type { Exception, Invoice } from "@/domain/schema";
import type { PolicyDecisionRow } from "@/store/db";
import type { ExceptionDetail } from "@/store/hooks";
import { ExceptionCards, ExceptionsEmpty, ExceptionsError, ExceptionsLoading } from "./ExceptionCards";
import { formatDateTime } from "@/domain/clock";
import {
  ExceptionDetailContent,
  ExceptionDetailError,
  allocateBlocker,
  executeStage,
  type PolicyGate,
} from "./ExceptionDetailParts";

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
    expect(out).toContain("bg-surface-sunken");
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
  shortPaymentInstances: [],
  creditNotes: [],
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

  it("payment evidence: Remittance shows the cited reference verbatim, and the no-reference copy only when there is none (TASK-79.8 review M2)", () => {
    const cited = content(
      detail({
        payment: {
          payment_id: "P-015",
          invoice_id: null,
          paid_on: "2026-10-28",
          amount_paise: paise(8_800_000),
          remittance_reference: "INV-1O37",
        },
      }),
    );
    expect(cited).toMatch(/Remittance<\/dt><dd[^>]*>INV-1O37<\/dd>/);
    expect(cited).not.toContain("None on file");

    const none = content(detail());
    expect(none).toMatch(/Remittance<\/dt><dd[^>]*>None on file — matched on amount<\/dd>/);
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

describe("/exceptions/[id] — Stage 1 Recommend Agent (TKT-75.03, Design-TASK-75 §4)", () => {
  it("no Stage 1 block for a non-payment exception kind (recommendation undefined)", () => {
    const out = content(detail({ recommendation: undefined }));
    expect(out).not.toContain('data-testid="stage-recommend"');
  });

  it("ok recommendation: verified facts with provenance, recommendation text, confidence", () => {
    const out = content(
      detail({
        recommendation: ok({
          exception_id: "RV-PAY-P-012",
          facts: [{ claimId: "amount", kind: "amount", value: "₹25,000.00", evidenceId: "P-012:payments.csv:amount_paise" }],
          recommendation_text: "Allocate P-012 to INV-F.",
          confidence: "high",
          candidate_invoice_ids: ["INV-F"],
          generated_at: "2026-11-05T00:00:00.000Z",
        }),
      }),
    );
    expect(out).toContain('data-testid="stage-recommend"');
    expect(out).toContain("1. Recommend Agent");
    expect(out).toContain("₹25,000.00");
    expect(out).toContain("Source: P-012:payments.csv:amount_paise");
    expect(out).toContain("Allocate P-012 to INV-F.");
    expect(out).toContain("high (exact match)");
  });

  it("F13 cannot-recommend: reason shown, no facts list", () => {
    const out = content(
      detail({ recommendation: { ok: false, error: new Rejected("No candidate invoices to recommend.") } }),
    );
    expect(out).toContain('data-testid="stage-recommend"');
    expect(out).toContain("Cannot recommend: No candidate invoices to recommend.");
  });
});

describe("/exceptions/[id] — Stage 2 Policy Agent + sidebar card (TKT-75.03, Design-TASK-75 §4/§9)", () => {
  function policyDecision(over: Partial<PolicyDecisionRow> = {}): PolicyDecisionRow {
    return {
      decision_id: "POL-RV-PAY-P-012-1",
      exception_id: "RV-PAY-P-012",
      evaluated_at: "2026-11-05T00:00:00.000Z",
      config_version: "policy-v1",
      verdict: "auto_permitted",
      reason: "Amount is ≤ ₹5,00,000 and the match is unambiguous.",
      ...over,
    };
  }

  it("loading (policyDecision undefined): both blocks say Evaluating…", () => {
    const out = content(detail(), { policyDecision: undefined });
    expect(out).toContain('data-testid="stage-policy"');
    expect(out).toContain('data-testid="policy-decision-card"');
    expect((out.match(/Evaluating…/g) ?? []).length).toBe(2);
  });

  it("not yet evaluated (policyDecision null): both blocks say so", () => {
    const out = content(detail(), { policyDecision: null });
    expect((out.match(/Not yet evaluated\./g) ?? []).length).toBe(2);
  });

  it("m2 error state: the evaluation failed — reason shown in an alert, never 'Not yet evaluated.'", () => {
    const out = content(detail(), { policyDecision: null, policyError: "the bank line is no longer on the ledger." });
    expect(out).toContain('data-testid="policy-error"');
    expect(out).toContain("Policy couldn’t evaluate: the bank line is no longer on the ledger.");
    expect(out).not.toContain("Not yet evaluated.");
  });

  it("m2 closed exception with no decision: says so, never 'Not yet evaluated.'", () => {
    const out = content(detail({ exception: { ...exception, status: "actioned" } }), { policyDecision: null });
    expect(out).not.toContain("Not yet evaluated.");
    expect((out.match(/Not evaluated — this exception was closed before Policy ran\./g) ?? []).length).toBe(2);
  });

  it("M2 stale decision: hidden while Policy re-evaluates (a stale verdict is never shown)", () => {
    const out = content(detail(), { policyDecision: policyDecision(), policyStale: true });
    expect(out).not.toContain("Auto-permitted");
    expect((out.match(/Re-evaluating — the inputs changed since the last decision…/g) ?? []).length).toBe(2);
  });

  it("auto_permitted: verdict, reason, POL-{id}, policy version, evaluated timestamp — no conflict warning", () => {
    const out = content(detail(), { policyDecision: policyDecision() });
    expect(out).toContain("Policy verdict: Auto-permitted");
    expect(out).toContain("Amount is ≤ ₹5,00,000 and the match is unambiguous.");
    expect(out).toContain("POL-RV-PAY-P-012-1");
    expect(out).toContain("policy-v1");
    expect(out).toContain("Policy Decision");
    expect(out).not.toContain('data-testid="policy-conflict"');
  });

  it.each(["needs_analyst", "needs_manager", "blocked"] as const)("verdict label for %s", (verdict) => {
    const out = content(detail(), { policyDecision: policyDecision({ verdict }) });
    expect(out).toContain(
      verdict === "needs_analyst" ? "Needs analyst review" : verdict === "needs_manager" ? "Needs manager review" : "Blocked",
    );
  });

  it("model/policy conflict (FS22): Policy wins, conflict shown", () => {
    const out = content(detail(), {
      policyDecision: policyDecision({ verdict: "needs_manager", model_policy_conflict: true }),
    });
    expect(out).toContain('data-testid="policy-conflict"');
    expect(out).toContain("Recommend and Policy disagreed — the Policy verdict governs (FS22).");
  });
});

describe("/exceptions/[id] — TC-75.24 action-bar matrix (A1 row 2) + Stage 3 Execute block (TKT-75.04)", () => {
  const pol = (over: Partial<PolicyDecisionRow> = {}): PolicyDecisionRow => ({
    decision_id: "POL-RV-PAY-P-012-1",
    exception_id: "RV-PAY-P-012",
    evaluated_at: "2026-11-05T00:00:00.000Z",
    config_version: "policy-v1",
    verdict: "auto_permitted",
    reason: "Amount is ≤ ₹5,00,000 and the match is unambiguous.",
    input_fingerprint: "fp",
    ...over,
  });
  const gate = (over: Partial<PolicyGate> = {}): PolicyGate => ({
    decision: pol(),
    stale: false,
    error: null,
    role: "analyst",
    executeRefused: false,
    ...over,
  });
  const closed = detail({ exception: { ...exception, status: "actioned", invoice_id: "INV-F" } });
  const executedAudit = {
    event_id: 41,
    action: "allocate_payment",
    subject: "review:RV-PAY-P-012",
    summary: "Allocated payment P-012 (₹25,000.00) to INV-F · policy policy-v1 (POL-RV-PAY-P-012-1)",
    at: "2026-11-05T09:30:00.000Z",
    actor_label: "Execute Agent",
    after: { policy_decision_id: "POL-RV-PAY-P-012-1", config_version: "policy-v1" },
  };

  it("auto_permitted resolved → disabled 'Already resolved'", () => {
    expect(allocateBlocker(closed, "INV-F", ALLOWED, gate())).toBe("Already resolved");
  });
  it("auto_permitted still open → disabled while the Execute agent applies it; enabled once Execute refused it", () => {
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate())).toBe("Execute agent is applying this allocation");
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ executeRefused: true }))).toBeNull();
  });
  it("needs_analyst → Analyst 'Submit for approval' enabled", () => {
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ decision: pol({ verdict: "needs_analyst" }) }))).toBeNull();
  });
  it("needs_manager → disabled for Analyst 'Manager approval required', enabled for Manager", () => {
    const g = { decision: pol({ verdict: "needs_manager", reason: "Low confidence." }) };
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate(g))).toBe("Manager approval required");
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ ...g, role: "manager" }))).toBeNull();
  });
  it("blocked → disabled with the policy reason, for every role", () => {
    const g = { decision: pol({ verdict: "blocked", reason: "No safe recommendation to evaluate." }) };
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate(g))).toBe("No safe recommendation to evaluate.");
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ ...g, role: "manager" }))).toBe("No safe recommendation to evaluate.");
  });
  it("no decision yet, a stale one, or a policy error → disabled until Policy has a current verdict", () => {
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ decision: undefined }))).toBe("Waiting for the policy decision");
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ decision: null }))).toBe("Waiting for the policy decision");
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ stale: true }))).toBe("Waiting for the policy decision");
    expect(allocateBlocker(detail(), "INV-F", ALLOWED, gate({ error: "x" }))).toBe("Policy couldn’t evaluate this item");
  });
  it("the bar renders the matrix reason with the button disabled", () => {
    const out = content(detail(), { policyGate: gate({ decision: pol({ verdict: "needs_manager" }) }) });
    expect(out).toContain("Manager approval required");
    expect(out).toMatch(/<button[^>]*data-testid="exception-submit"[^>]*disabled/);
  });

  it("Stage 3 executed (A1 row 1): 'Executed by Execute agent · {time} · policy v{n}' from the persisted audit", () => {
    const s = executeStage({ detail: detail({ ...closed, audit: [executedAudit] }), gate: gate() });
    expect(s.state).toBe("executed");
    expect(s.status).toBe(`Executed by Execute agent · ${formatDateTime(executedAudit.at)} · policy v1`);
    const out = content(detail({ ...closed, audit: [executedAudit] }), { policyGate: gate() });
    expect(out).toContain('data-testid="stage-execute"');
    expect(out).toContain("3. Execute Agent");
    expect(out).toContain("Executed by Execute agent · ");
    expect(out).toContain("POL-RV-PAY-P-012-1");
  });
  it.each([
    ["needs_analyst", "analyst", /^Ready to allocate/, /Analyst/],
    ["needs_manager", "analyst", /^Pending manager hand-off/, /Manager/],
    ["blocked", "manager", /^Not executable/, /No write/],
  ] as const)("Stage 3 %s → status + what happens next", (verdict, role, status, next) => {
    const s = executeStage({ detail: detail(), gate: gate({ decision: pol({ verdict }), role }) });
    expect(s.status).toMatch(status);
    expect(s.next).toMatch(next);
  });
  it("Stage 3 auto_permitted open → applying; refused → reason + a human takes it", () => {
    expect(executeStage({ detail: detail(), gate: gate() }).state).toBe("applying");
    const r = executeStage({
      detail: detail(),
      gate: gate({ executeRefused: true }),
      outcome: { kind: "refused", reason: "A Manager reversed this allocation; it stays with a human." },
    });
    expect(r.state).toBe("refused");
    expect(r.status).toContain("A Manager reversed this allocation");
  });
  it("Stage 3 loading / error / closed-by-a-person states", () => {
    expect(executeStage({ detail: detail(), gate: gate({ decision: undefined }) }).state).toBe("waiting");
    expect(executeStage({ detail: detail(), gate: gate({ error: "x" }) }).state).toBe("error");
    expect(executeStage({ detail: detail(), gate: gate(), error: "disk full" }).state).toBe("error");
    const human = executeStage({ detail: detail({ ...closed, audit: [{ ...executedAudit, actor_label: "Analyst" }] }), gate: gate() });
    expect(human.state).toBe("resolved");
    expect(human.status).not.toContain("Executed by Execute agent");
  });
  it("no Stage 3 block for a non-payment exception", () => {
    const out = content(detail({ exception: { ...exception, kind: "dispute" } }), { policyGate: gate() });
    expect(out).not.toContain('data-testid="stage-execute"');
  });
});

describe("/exceptions/[id] — short-payment kinds (TKT-75.05, Design-TASK-75 §8/§11, TC-75.29/30 UI)", () => {
  const pol = (over: Partial<PolicyDecisionRow> = {}): PolicyDecisionRow => ({
    decision_id: "POL-RV-SPP-C-001-1",
    exception_id: "RV-SPP-C-001",
    evaluated_at: "2026-11-05T00:00:00.000Z",
    config_version: "policy-v1",
    verdict: "needs_analyst",
    reason: "Policy rules for \"short_payment_pattern\" are not yet defined; routed to Analyst review.",
    input_fingerprint: "fp",
    ...over,
  });
  const gate = (over: Partial<PolicyGate> = {}): PolicyGate => ({
    decision: pol(),
    stale: false,
    error: null,
    role: "manager",
    executeRefused: false,
    ...over,
  });
  const spInstance = (n: number, over: Partial<Exception> = {}): Exception => ({
    review_id: `RV-SP-INV-00${n}`,
    kind: "short_payment",
    invoice_id: `INV-00${n}`,
    payment_id: `P-10${n}`,
    customer_id: "C-001",
    deducted_paise: paise(100_000),
    deduction_reason: "Damaged goods",
    linked_review_ids: ["RV-SPP-C-001"],
    recommendation: "Check the stated reason before a Manager writes off ₹1,000.00",
    evidence_ids: [],
    validation_status: "verified",
    escalation_reason: "",
    requires_role: "manager",
    status: "open",
    ...over,
  });
  const spPattern: Exception = {
    review_id: "RV-SPP-C-001",
    kind: "short_payment_pattern",
    customer_id: "C-001",
    deducted_paise: paise(300_000),
    linked_review_ids: ["RV-SP-INV-001", "RV-SP-INV-002", "RV-SP-INV-003"],
    recommendation: "Needs review: 1 of 3 short payments state no reason",
    evidence_ids: [],
    validation_status: "missing",
    escalation_reason: "3 short payments, 3 or more within 90 days, totalling ₹3,000.00",
    requires_role: "manager",
    status: "open",
  };
  const sp = (over: Partial<ExceptionDetail> = {}) =>
    detail({
      exception: spPattern,
      payment: undefined,
      candidates: [],
      shortPaymentInstances: [spInstance(1), spInstance(2, { deduction_reason: undefined }), spInstance(3)],
      ...over,
    });
  const DENIED = { allowed: false, reason: "Only a Manager can approve a write-off." } as const;
  const writeOff = (permission: { allowed: boolean } = ALLOWED, busy = false) => ({ permission, busy, onRequest: () => {} });
  const writeOffAudit = {
    event_id: 77,
    action: "approve_write_off",
    subject: "review:RV-SPP-C-001",
    summary: "Approved write-off of ₹3,000.00 (3 credit notes: CN-INV-001, CN-INV-002, CN-INV-003)",
    at: "2026-11-05T10:00:00.000Z",
    actor_label: "Manager",
  };

  it("shows the short-payment history in place of the bank-line and candidate-invoice groups", () => {
    const out = content(sp(), { policyGate: gate() });
    expect(out).toContain('data-testid="short-payment-history"');
    expect(out).not.toContain('data-testid="payment-evidence"');
    expect(out).not.toContain("No open invoice matches this item.");
    expect(out).not.toContain('data-testid="credit-note-evidence"');
  });

  it("CreditNote evidence appears once a note exists", () => {
    const out = content(
      sp({
        exception: { ...spPattern, status: "actioned" },
        creditNotes: [{ credit_note_id: "CN-INV-001", invoice_id: "INV-001", created_at: "2026-11-05T10:00:00.000Z", amount_paise: 100_000 }],
      }),
      { policyGate: gate() },
    );
    expect(out).toContain('data-testid="credit-note-evidence"');
    expect(out).toContain("CN-INV-001");
  });

  it("Manager: the action bar carries “Approve write-off”; Submit (allocation) says why it doesn't apply", () => {
    const out = content(sp(), { policyGate: gate(), writeOff: writeOff() });
    expect(out).toContain('data-testid="approve-write-off"');
    expect(allocateBlocker(sp(), null, ALLOWED, gate())).toBe("A short payment is written off, not allocated");
    expect(out).toContain('data-testid="exception-submit"');
  });

  it("Analyst: no write-off control at all, and Submit says Manager approval is required", () => {
    const out = content(sp(), { permission: { allowed: false, reason: "x" }, policyGate: gate({ role: "analyst" }), writeOff: writeOff(DENIED) });
    expect(out).not.toContain('data-testid="approve-write-off"');
    expect(allocateBlocker(sp(), null, { allowed: false, reason: "x" }, gate({ role: "analyst" }))).toBe("Manager approval required");
  });

  it("closed: Submit is 'Already resolved' and no write-off control", () => {
    const closedSp = sp({ exception: { ...spPattern, status: "actioned" } });
    const out = content(closedSp, { policyGate: gate(), writeOff: writeOff() });
    expect(out).not.toContain('data-testid="approve-write-off"');
    expect(allocateBlocker(closedSp, null, ALLOWED, gate())).toBe("Already resolved");
  });

  it("TC-75.30: Stage 3 never auto-writes a credit note — even on an auto_permitted verdict", () => {
    for (const verdict of ["auto_permitted", "needs_analyst", "needs_manager"]) {
      const s = executeStage({ detail: sp(), gate: gate({ decision: pol({ verdict }) }) });
      expect(s.state).toBe("manager");
      expect(s.status).toBe("Pending manager write-off.");
      expect(s.next).toContain("Execute never writes a credit note");
    }
  });

  it("Stage 3 after a write-off reads the persisted approve_write_off event", () => {
    const s = executeStage({ detail: sp({ exception: { ...spPattern, status: "actioned" }, audit: [writeOffAudit] }), gate: gate() });
    expect(s.state).toBe("resolved");
    expect(s.status).toContain("Written off by a Manager");
    expect(s.status).toContain(formatDateTime(writeOffAudit.at));
  });

  it("Stage 3 still waits for a current Policy decision first", () => {
    expect(executeStage({ detail: sp(), gate: gate({ decision: undefined }) }).state).toBe("waiting");
  });
});
