import { describe, expect, it } from "vitest";
import type { Check, Draft } from "@/domain/schema";
import { checkFix, checksSummary, nextStep, orderChecks, primaryAction } from "./draftActions";

const NAMES = [
  "Invoice exists",
  "Customer matches",
  "Amount matches outstanding",
  "Currency present",
  "Due date present",
  "No open dispute",
  "No payment claimed",
  "Invoice still open",
  "Every fact is footnoted",
];

function checks(failing: number[] = []): Check[] {
  return NAMES.map((name, i) => ({
    id: i + 1,
    name,
    passed: !failing.includes(i + 1),
    reason: failing.includes(i + 1) ? `reason ${i + 1}` : "ok",
  }));
}

function draft(over: Partial<Draft> = {}): Draft {
  const c = over.checks ?? checks();
  return {
    draft_id: "DR-INV-A-1",
    invoice_id: "INV-A",
    customer_id: "C-001",
    status: "generated",
    subject: "Payment reminder",
    body: "Dear customer,",
    facts: [],
    footnotes: [],
    amount_paise: 34_000_000,
    ambiguous_match: false,
    conflicting_payment: false,
    checks: c,
    failed_checks: c.filter((x) => !x.passed).map((x) => x.id),
    created_at: "2026-10-30T09:00:00.000Z",
    ...over,
  };
}

describe("checks (TC-045)", () => {
  it("summarises as 'N of 9 passed'", () => {
    expect(checksSummary(checks())).toBe("9 of 9 passed");
    expect(checksSummary(checks([6]))).toBe("8 of 9 passed");
  });

  it("puts failures first, keeping id order within each group", () => {
    const { failed, passed } = orderChecks(checks([9, 6]));
    expect(failed.map((c) => c.id)).toEqual([6, 9]);
    expect(passed.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 7, 8]);
  });

  it("gives every failing check a fix", () => {
    for (let id = 1; id <= 9; id++) expect(checkFix(id).label).not.toBe("");
    expect(checkFix(7).href).toBe("/payments");
    expect(checkFix(9).edit).toBe(true);
  });
});

describe("primaryAction (TC-045)", () => {
  it("is 'Submit for approval' for an Analyst and 'Approve & send' for a Manager", () => {
    expect(primaryAction("analyst", draft(), { approveWired: false }).label).toBe("Submit for approval");
    expect(primaryAction("manager", draft(), { approveWired: true }).label).toBe("Approve & send");
  });

  it("is enabled for an Analyst on a clean generated or edited draft", () => {
    expect(primaryAction("analyst", draft(), { approveWired: false })).toMatchObject({ enabled: true, reason: null });
    expect(primaryAction("analyst", draft({ status: "edited" }), { approveWired: false }).enabled).toBe(true);
  });

  it("is disabled with a reason when there is no draft", () => {
    expect(primaryAction("analyst", null, { approveWired: false })).toMatchObject({
      enabled: false,
      reason: "Generate a draft first",
    });
  });

  it("counts failing checks in the reason", () => {
    expect(primaryAction("analyst", draft({ checks: checks([6]) }), { approveWired: false }).reason).toBe(
      "1 pre-approval check is failing",
    );
    expect(primaryAction("manager", draft({ checks: checks([6, 9]) }), { approveWired: true }).reason).toBe(
      "2 pre-approval checks are failing",
    );
  });

  it("explains an already-submitted draft", () => {
    expect(primaryAction("analyst", draft({ status: "validated" }), { approveWired: false }).reason).toBe(
      "Already submitted for approval",
    );
  });

  it("disables Approve & send until approval is wired", () => {
    expect(primaryAction("manager", draft({ status: "validated" }), { approveWired: false })).toMatchObject({
      enabled: false,
      reason: "Available once approval is enabled",
    });
    expect(primaryAction("manager", draft({ status: "validated" }), { approveWired: true }).enabled).toBe(true);
  });

  it("blocks Approve & send inline when the invoice has an open dispute, even with stale passing checks (TASK-16)", () => {
    expect(
      primaryAction("manager", draft({ status: "validated" }), { approveWired: true, openDispute: true }),
    ).toMatchObject({ enabled: false, reason: "This invoice has an open dispute" });
    expect(
      primaryAction("manager", draft({ status: "validated" }), { approveWired: true, openDispute: false }).enabled,
    ).toBe(true);
    // Checks that already reflect the dispute keep their more specific reason.
    expect(
      primaryAction("manager", draft({ status: "validated", checks: checks([6]) }), { approveWired: true, openDispute: true })
        .reason,
    ).toBe("1 pre-approval check is failing");
  });

  it("is disabled once the reminder has gone out", () => {
    expect(primaryAction("manager", draft({ status: "sent_simulated" }), { approveWired: true })).toMatchObject({
      enabled: false,
      reason: "This reminder has been sent",
    });
  });
});

describe("nextStep (TC-045)", () => {
  it("asks for a draft when there is none", () => {
    expect(nextStep("analyst", null)).toMatch(/^Generate a reminder/);
  });

  it("names the first failing check and why", () => {
    const s = nextStep("analyst", draft({ checks: checks([6]) }));
    expect(s).toContain("No open dispute");
    expect(s).toContain("reason 6");
  });

  it("tells an Analyst to submit a clean draft, and a Manager to approve it", () => {
    expect(nextStep("analyst", draft())).toMatch(/^Submit the reminder for approval/);
    expect(nextStep("manager", draft({ status: "validated" }))).toMatch(/^Approve and send/);
  });

  it("says why a submitted draft needs a Manager", () => {
    expect(nextStep("analyst", draft({ status: "validated", amount_paise: 60_000_000 }))).toMatch(
      /Manager.*above ₹5,00,000/,
    );
  });
});

// CR-001: approving or submitting while the editor is open would send the
// stored body, not the unsaved text on screen.
describe("primaryAction while the draft editor is open (CR-001)", () => {
  it("blocks Approve & send for a Manager until the edit is saved or cancelled", () => {
    const p = primaryAction("manager", draft({ status: "validated" }), { approveWired: true, editing: true });
    expect(p.enabled).toBe(false);
    expect(p.reason).toBe("Save or cancel your edits first");
  });

  it("blocks Submit for approval for an Analyst too", () => {
    const p = primaryAction("analyst", draft(), { approveWired: true, editing: true });
    expect(p.enabled).toBe(false);
    expect(p.reason).toBe("Save or cancel your edits first");
  });
});
