import { describe, expect, it } from "vitest";
import { paise } from "./money";
import {
  ACTIONS,
  MANAGER_APPROVAL_THRESHOLD,
  ROLES,
  can,
  type Action,
  type Role,
  type Subject,
} from "./permissions";

const inv: Subject = { kind: "invoice", id: "INV-1" };
const sys: Subject = { kind: "system", id: "workspace" };
const disp: Subject = { kind: "dispute", id: "D-1" };
const draft = (extra: Partial<Subject> = {}): Subject => ({
  kind: "draft",
  id: "DR-1",
  amount_paise: paise(1_000_000),
  ...extra,
});
const review = (extra: Partial<Subject> = {}): Subject => ({
  kind: "review",
  id: "RV-1",
  review_kind: "data_issue",
  ...extra,
});

type Row = { subject: Subject; analyst: boolean; manager: boolean };

/**
 * S4 baseline matrix. `satisfies Record<Action, Row>` makes this test fail to
 * typecheck when a new Action is added without a row (TC-035).
 */
const BASELINE = {
  add_note: { subject: inv, analyst: true, manager: true },
  generate_draft: { subject: inv, analyst: true, manager: true },
  edit_draft: { subject: draft(), analyst: true, manager: true },
  submit_draft: { subject: draft(), analyst: true, manager: true },
  approve_draft: { subject: draft(), analyst: true, manager: true },
  reject_draft: { subject: draft(), analyst: true, manager: true },
  mark_disputed: { subject: inv, analyst: true, manager: true },
  dispute_transition: { subject: disp, analyst: true, manager: true },
  resolve_dispute: { subject: disp, analyst: false, manager: true },
  dismiss_review: { subject: review(), analyst: true, manager: true },
  action_review: { subject: review(), analyst: true, manager: true },
  reconcile_flag: { subject: review({ review_kind: "reconciliation", requires_role: "manager" }), analyst: true, manager: true },
  reconcile_decide: { subject: review({ review_kind: "reconciliation" }), analyst: false, manager: true },
  import_csv: { subject: sys, analyst: true, manager: true },
  reset_demo: { subject: sys, analyst: true, manager: true },
  switch_role: { subject: sys, analyst: true, manager: true },
  set_as_of: { subject: sys, analyst: true, manager: true },
} satisfies Record<Action, Row>;

/** Escalated subject conditions (S4 + A6). */
const CONDITIONS: Array<{
  name: string;
  action: Action;
  subject: Subject;
  analyst: boolean;
}> = [
  {
    name: "reminder exactly ₹5,00,000",
    action: "approve_draft",
    subject: draft({ amount_paise: MANAGER_APPROVAL_THRESHOLD }),
    analyst: true,
  },
  {
    name: "reminder > ₹5,00,000",
    action: "approve_draft",
    subject: draft({ amount_paise: paise(MANAGER_APPROVAL_THRESHOLD + 1) }),
    analyst: false,
  },
  {
    name: "ambiguous match",
    action: "approve_draft",
    subject: draft({ ambiguous_match: true }),
    analyst: false,
  },
  {
    name: "conflicting payment info",
    action: "approve_draft",
    subject: draft({ conflicting_payment: true }),
    analyst: false,
  },
  {
    name: "dismiss reconciliation item",
    action: "dismiss_review",
    subject: review({ review_kind: "reconciliation" }),
    analyst: false,
  },
  {
    name: "dismiss manager-only item",
    action: "dismiss_review",
    subject: review({ requires_role: "manager" }),
    analyst: false,
  },
  {
    name: "action manager-only item",
    action: "action_review",
    subject: review({ requires_role: "manager" }),
    analyst: false,
  },
  {
    name: "action reconciliation item",
    action: "action_review",
    subject: review({ review_kind: "reconciliation" }),
    analyst: true,
  },
  {
    name: "verify or reject a payment claim",
    action: "reconcile_decide",
    subject: review({ review_kind: "reconciliation" }),
    analyst: false,
  },
];

describe("permissions (TC-035)", () => {
  it("matrix covers every Action exactly", () => {
    expect(Object.keys(BASELINE).sort()).toEqual([...ACTIONS].sort());
  });

  for (const role of ROLES) {
    for (const action of ACTIONS) {
      const row = BASELINE[action];
      it(`${role} × ${action} → ${row[role] ? "allowed" : "denied"}`, () => {
        const r = can(role, action, row.subject);
        expect(r.allowed).toBe(row[role]);
        if (!r.allowed) expect(r.reason).toMatch(/\w{3,}/);
      });
    }
  }

  for (const c of CONDITIONS) {
    it(`condition: ${c.name}`, () => {
      const a = can("analyst", c.action, c.subject);
      expect(a.allowed).toBe(c.analyst);
      if (!a.allowed) expect(a.reason).toMatch(/Manager/);
      // A Manager is never blocked by an escalation condition.
      expect(can("manager", c.action, c.subject).allowed).toBe(true);
    });
  }

  it("denial reason for > ₹5,00,000 names the threshold", () => {
    const r = can(
      "analyst",
      "approve_draft",
      draft({ amount_paise: paise(60_000_000) }),
    );
    expect(r).toEqual({
      allowed: false,
      reason: "Only a Manager can approve reminders above ₹5,00,000.",
    });
  });

  it("allowed results carry no reason", () => {
    expect(can("manager", "resolve_dispute", disp)).toEqual({ allowed: true });
  });

  it("roles are exactly analyst and manager", () => {
    expect([...ROLES]).toEqual(["analyst", "manager"] satisfies Role[]);
  });
});
