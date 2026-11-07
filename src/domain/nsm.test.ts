import { describe, expect, it } from "vitest";

import { computeNsm, NSM_HEADING, NSM_LABEL, type NsmAuditEvent, type NsmInput } from "./nsm";

// TC-75.41 / TC-75.42 / TC-75.43 (TKT-75.07, EXE170–EXE172). Every number
// below comes from the events the test builds — nothing is seeded.

const T0 = "2026-11-07T10:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

let nextId = 1;
function ev(e: Partial<NsmAuditEvent> & Pick<NsmAuditEvent, "action" | "subject">): NsmAuditEvent {
  return { event_id: nextId++, at: at(nextId), actor_role: "analyst", actor_label: "Analyst", ...e };
}
const reset = (min = 0) => ev({ action: "demo_reset", subject: "system:demo", at: at(min), actor_role: "manager" });
const allocate = (review: string, invoice: string, min: number, extra: Partial<NsmAuditEvent> = {}) =>
  ev({
    action: "allocate_payment",
    subject: `review:${review}`,
    at: at(min),
    invoice_id: invoice,
    before: { status: "open", invoice_id: null },
    after: { status: "actioned", invoice_id: invoice },
    ...extra,
  });
const reverse = (review: string, allocation: NsmAuditEvent, min: number) =>
  ev({
    action: "reverse_allocation",
    subject: `review:${review}`,
    at: at(min),
    actor_role: "manager",
    actor_label: "Manager",
    before: { status: "actioned" },
    after: { status: "open", invoice_id: null, reopen_reason: "reversed", reverses_event_id: allocation.event_id },
  });

/**
 * An Execute-agent allocation exactly as 79.4 writes it (`asExecuteAgent`,
 * commands.ts on task/79.4-execute): `run()` as the Analyst, re-labelled
 * "Execute Agent", the decision id inside `after` and first in
 * `evidence_ids`. Keep this literal in step with that helper.
 */
const executeAllocate = (review: string, invoice: string, min: number, decisionId: string) =>
  allocate(review, invoice, min, {
    actor_role: "analyst",
    actor_label: "Execute Agent",
    summary: `Allocated payment to ${invoice} · policy policy-v1 (${decisionId})`,
    after: { status: "actioned", invoice_id: invoice, policy_decision_id: decisionId, config_version: "policy-v1" },
    evidence_ids: [decisionId],
  });

function input(audit: NsmAuditEvent[], over: Partial<NsmInput> = {}): NsmInput {
  return {
    audit,
    payments: [
      { payment_id: "PAY-1", invoice_id: "INV-1", amount_paise: 50_000_00 },
      { payment_id: "PAY-2", invoice_id: "INV-2", amount_paise: 12_345_00 },
    ],
    exceptions: [
      { review_id: "EXC-1", kind: "unallocated_payment", status: "actioned", payment_id: "PAY-1" },
      { review_id: "EXC-2", kind: "unallocated_payment", status: "actioned", payment_id: "PAY-2" },
    ],
    invoices: [
      { invoice_id: "INV-1", status: "open" },
      { invoice_id: "INV-2", status: "open" },
      { invoice_id: "INV-9", status: "open" },
    ],
    disputes: [],
    policyDecisions: [],
    ...over,
  };
}

describe("computeNsm — TC-75.41 value of correctly resolved exceptions", () => {
  it("is zero for a session with no actions (nothing seeded)", () => {
    const r = computeNsm(input([reset()]));
    expect(r.valuePaise).toBe(0);
    expect(r.resolvedCount).toBe(0);
  });

  it("is zero for an empty audit log", () => {
    expect(computeNsm(input([])).valuePaise).toBe(0);
  });

  it("an allocation counts at its payment's value", () => {
    const r = computeNsm(input([reset(), allocate("EXC-1", "INV-1", 5)]));
    expect(r.valuePaise).toBe(50_000_00);
    expect(r.resolvedCount).toBe(1);
  });

  it("sums several allocations", () => {
    const r = computeNsm(input([reset(), allocate("EXC-1", "INV-1", 5), allocate("EXC-2", "INV-2", 6)]));
    expect(r.valuePaise).toBe(50_000_00 + 12_345_00);
    expect(r.resolvedCount).toBe(2);
  });

  it("a reversal removes it", () => {
    const r0 = reset();
    const a = allocate("EXC-1", "INV-1", 5);
    const r = computeNsm(
      input([r0, a, reverse("EXC-1", a, 9)], {
        exceptions: [{ review_id: "EXC-1", kind: "unallocated_payment", status: "open", payment_id: "PAY-1", reversed: true }],
        payments: [{ payment_id: "PAY-1", invoice_id: null, amount_paise: 50_000_00 }],
      }),
    );
    expect(r.valuePaise).toBe(0);
    expect(r.resolvedCount).toBe(0);
  });

  it("allocate → reverse → re-allocate counts once, at the re-allocated value (sticky `reversed` marker ignored)", () => {
    const r0 = reset();
    const first = allocate("EXC-1", "INV-1", 5);
    const r = computeNsm(
      input([r0, first, reverse("EXC-1", first, 9), allocate("EXC-1", "INV-9", 12)], {
        exceptions: [{ review_id: "EXC-1", kind: "unallocated_payment", status: "actioned", payment_id: "PAY-1", reversed: true }],
        payments: [{ payment_id: "PAY-1", invoice_id: "INV-9", amount_paise: 50_000_00 }],
      }),
    );
    expect(r.valuePaise).toBe(50_000_00);
    expect(r.resolvedCount).toBe(1);
  });

  it("pairs events, not row state: a reversed allocation is excluded even if the row still reads actioned", () => {
    const r0 = reset();
    const a = allocate("EXC-1", "INV-1", 5);
    const r = computeNsm(input([r0, a, reverse("EXC-1", a, 9)]));
    expect(r.valuePaise).toBe(0);
  });

  it("a reopen (actioned → open without a pointer) removes the latest closing on that subject", () => {
    const r = computeNsm(
      input(
        [
          reset(),
          allocate("EXC-1", "INV-1", 5),
          ev({ action: "reopen_exception", subject: "review:EXC-1", at: at(8), before: { status: "actioned" }, after: { status: "open" } }),
        ],
        { exceptions: [{ review_id: "EXC-1", kind: "unallocated_payment", status: "open", payment_id: "PAY-1" }] },
      ),
    );
    expect(r.valuePaise).toBe(0);
  });

  it("never counts an item whose current status is not actioned (defensive)", () => {
    const r = computeNsm(
      input([reset(), allocate("EXC-1", "INV-1", 5)], {
        exceptions: [{ review_id: "EXC-1", kind: "unallocated_payment", status: "open", payment_id: "PAY-1" }],
      }),
    );
    expect(r.valuePaise).toBe(0);
  });

  it("counts nothing from before the current session (demo reset or as-of change starts a new one)", () => {
    const before = [allocate("EXC-1", "INV-1", 1)];
    expect(computeNsm(input([...before, reset(3)])).valuePaise).toBe(0);
    const moved = ev({ action: "set_as_of", subject: "system:as_of", at: at(4), before: { as_of: "2026-10-30" }, after: { as_of: "2026-11-15" } });
    const r = computeNsm(input([...before, moved, allocate("EXC-2", "INV-2", 6)]));
    expect(r.valuePaise).toBe(12_345_00);
    expect(r.sessionStartEventId).toBe(moved.event_id);
  });

  it("without a boundary event the whole log is the session (first seed writes no event)", () => {
    const r = computeNsm(input([allocate("EXC-1", "INV-1", 1)]));
    expect(r.valuePaise).toBe(50_000_00);
    expect(r.sessionStartEventId).toBeNull();
  });

  it("is generic over closing actions: a closing with no registered value is not counted, and v1 review actions are not closings", () => {
    const r = computeNsm(
      input([
        reset(),
        ev({ action: "action_review", subject: "review:EXC-2", after: { status: "actioned" } }),
        ev({ action: "approve_write_off", subject: "review:EXC-1", after: { status: "actioned" } }),
      ]),
    );
    expect(r.valuePaise).toBe(0);
  });

  it("an allocation by an unapproved actor does not count (A1: human or auto_permitted only)", () => {
    const r = computeNsm(input([reset(), allocate("EXC-1", "INV-1", 5, { actor_role: "system", actor_label: "Copilot" })]));
    expect(r.valuePaise).toBe(0);
  });

  it("an Execute-agent allocation (79.4's row shape) backed by an auto_permitted PolicyDecision counts", () => {
    const r = computeNsm(
      input([reset(), executeAllocate("EXC-1", "INV-1", 5, "POL-EXC-1-1")], {
        policyDecisions: [{ decision_id: "POL-EXC-1-1", exception_id: "EXC-1", verdict: "auto_permitted" }],
      }),
    );
    expect(r.valuePaise).toBe(50_000_00);
    expect(r.resolvedCount).toBe(1);
    expect(r.guardrails.actionsWithoutApproval).toBe(0);
  });

  it("an Execute-agent allocation on a needs_manager decision does not count and is an action without approval", () => {
    const r = computeNsm(
      input([reset(), executeAllocate("EXC-1", "INV-1", 5, "POL-EXC-1-1")], {
        policyDecisions: [{ decision_id: "POL-EXC-1-1", exception_id: "EXC-1", verdict: "needs_manager" }],
      }),
    );
    expect(r.valuePaise).toBe(0);
    expect(r.resolvedCount).toBe(0);
    expect(r.guardrails.actionsWithoutApproval).toBe(1);
  });

  it("an Execute-agent row is judged by its decision, never by the actor classifier: no id, or an unknown id, is unapproved", () => {
    const r0 = reset(); // first: event ids follow construction order
    const noId = allocate("EXC-1", "INV-1", 5, { actor_role: "analyst", actor_label: "Execute Agent" });
    const unknownId = executeAllocate("EXC-2", "INV-2", 6, "POL-MISSING");
    const r = computeNsm(input([r0, noId, unknownId]));
    expect(r.valuePaise).toBe(0);
    expect(r.guardrails.actionsWithoutApproval).toBe(2);
  });

  it("any row naming a decision goes through the decision check, whatever its label", () => {
    const r = computeNsm(
      input(
        [
          reset(),
          allocate("EXC-1", "INV-1", 5, { after: { status: "actioned", invoice_id: "INV-1", policy_decision_id: "POL-EXC-1-1" } }),
        ],
        { policyDecisions: [{ decision_id: "POL-EXC-1-1", exception_id: "EXC-1", verdict: "blocked" }] },
      ),
    );
    expect(r.valuePaise).toBe(0);
    expect(r.guardrails.actionsWithoutApproval).toBe(1);
  });

  it("only counts payment-exception subjects that exist", () => {
    const r = computeNsm(input([reset(), allocate("EXC-404", "INV-1", 5)]));
    expect(r.valuePaise).toBe(0);
  });
});

describe("computeNsm — TC-75.42 guardrails from the same session", () => {
  it("are all empty/zero for a session with no actions", () => {
    const g = computeNsm(input([reset()])).guardrails;
    expect(g).toMatchObject({
      closings: 0,
      reversedOrReopened: 0,
      reversalRate: null,
      reminderSends: 0,
      inappropriateReminders: 0,
      inappropriateReminderRate: null,
      actionsWithoutApproval: 0,
      medianRaisedToResolvedMs: null,
      escalated: 0,
      evaluated: 0,
      escalationRate: null,
    });
  });

  it("reversal/reopen rate = closings later reversed or reopened ÷ closings in the session", () => {
    const r0 = reset();
    const a = allocate("EXC-1", "INV-1", 5);
    const g = computeNsm(
      input([r0, a, reverse("EXC-1", a, 9), allocate("EXC-1", "INV-9", 12), allocate("EXC-2", "INV-2", 13)]),
    ).guardrails;
    expect(g.closings).toBe(3);
    expect(g.reversedOrReopened).toBe(1);
    expect(g.reversalRate).toBeCloseTo(1 / 3);
  });

  it("inappropriate-reminder rate = sends on disputed, paid or unapplied-cash invoices ÷ sends", () => {
    const send = (invoice: string, action = "approve_draft") =>
      ev({ action, subject: `draft:D-${invoice}`, invoice_id: invoice, actor_label: action === "autopilot_send" ? "Copilot" : "Analyst" });
    const g = computeNsm(
      input([reset(), send("INV-1"), send("INV-2"), send("INV-3"), send("INV-4", "autopilot_send"), send("INV-9")], {
        invoices: [
          { invoice_id: "INV-1", status: "open" },
          { invoice_id: "INV-2", status: "paid" },
          { invoice_id: "INV-3", status: "open" },
          { invoice_id: "INV-4", status: "partially_paid" },
          { invoice_id: "INV-9", status: "open" },
        ],
        disputes: [
          { invoice_id: "INV-3", status: "under_review" },
          { invoice_id: "INV-4", status: "new" },
          { invoice_id: "INV-1", status: "resolved" },
        ],
        exceptions: [{ review_id: "EXC-1", kind: "unallocated_payment", status: "open", payment_id: "PAY-1", candidate_invoice_ids: ["INV-9"] }],
      }),
    ).guardrails;
    expect(g.reminderSends).toBe(5);
    // INV-2 paid, INV-3 and INV-4 open disputes, INV-9 unapplied-cash candidate; INV-1's dispute is closed.
    expect(g.inappropriateReminders).toBe(4);
    expect(g.inappropriateReminderRate).toBeCloseTo(4 / 5);
  });

  it("actions executed without approval counts closings and sends with neither a human nor an auto_permitted decision", () => {
    const g = computeNsm(
      input(
        [
          reset(),
          executeAllocate("EXC-1", "INV-1", 5, "POL-EXC-1-1"),
          executeAllocate("EXC-2", "INV-2", 6, "POL-EXC-2-1"),
          ev({ action: "approve_draft", subject: "draft:D-1", invoice_id: "INV-1", actor_role: undefined, actor_label: undefined }),
          ev({ action: "autopilot_send", subject: "draft:D-2", invoice_id: "INV-1", actor_label: "Copilot" }),
        ],
        {
          policyDecisions: [
            { decision_id: "POL-EXC-1-1", exception_id: "EXC-1", verdict: "auto_permitted" },
            { decision_id: "POL-EXC-2-1", exception_id: "EXC-2", verdict: "needs_manager" },
          ],
        },
      ),
    ).guardrails;
    // EXC-2's decision did not permit it; the draft approval records no actor.
    expect(g.actionsWithoutApproval).toBe(2);
  });

  it("median raised→resolved: raised = session start, or the reopen before the closing", () => {
    const r0 = reset(0);
    const a = allocate("EXC-1", "INV-1", 10);
    const g = computeNsm(
      input([r0, a, reverse("EXC-1", a, 20), allocate("EXC-1", "INV-9", 50), allocate("EXC-2", "INV-2", 30)]),
    ).guardrails;
    // Counted closings: EXC-1 re-allocation (20 → 50 = 30 min), EXC-2 (0 → 30 = 30 min).
    expect(g.medianRaisedToResolvedMs).toBe(30 * 60_000);
    expect(g.resolutionTimesMeasured).toBe(2);
  });

  it("median is the middle of an even set (mean of the two middle values)", () => {
    const g = computeNsm(input([reset(0), allocate("EXC-1", "INV-1", 10), allocate("EXC-2", "INV-2", 30)])).guardrails;
    expect(g.medianRaisedToResolvedMs).toBe(20 * 60_000);
  });

  it("median is unmeasured (null) when the session start is unknown (no boundary event)", () => {
    const g = computeNsm(input([allocate("EXC-1", "INV-1", 10)])).guardrails;
    expect(g.medianRaisedToResolvedMs).toBeNull();
    expect(g.resolutionTimesUnmeasured).toBe(1);
  });

  it("escalation rate = evaluated exceptions whose latest in-session verdict is needs_manager ÷ evaluated", () => {
    const evaluated = (review: string, decision: string) =>
      ev({ action: "policy_evaluated", subject: `review:${review}`, actor_role: "system", actor_label: "Policy Agent", evidence_ids: [decision] });
    const g = computeNsm(
      input(
        [
          evaluated("EXC-3", "POL-EXC-3-1"), // before the session: ignored
          reset(),
          evaluated("EXC-1", "POL-EXC-1-1"),
          evaluated("EXC-1", "POL-EXC-1-2"),
          evaluated("EXC-2", "POL-EXC-2-1"),
        ],
        {
          policyDecisions: [
            { decision_id: "POL-EXC-3-1", exception_id: "EXC-3", verdict: "needs_manager" },
            { decision_id: "POL-EXC-1-1", exception_id: "EXC-1", verdict: "auto_permitted" },
            { decision_id: "POL-EXC-1-2", exception_id: "EXC-1", verdict: "needs_manager" },
            { decision_id: "POL-EXC-2-1", exception_id: "EXC-2", verdict: "needs_analyst" },
          ],
        },
      ),
    ).guardrails;
    expect(g.evaluated).toBe(2);
    expect(g.escalated).toBe(1);
    expect(g.escalationRate).toBe(0.5);
  });
});

describe("TC-75.43 honest label", () => {
  it("is the literal approved copy", () => {
    expect(NSM_LABEL).toBe("Simulated — one demo session = one analyst-week");
    expect(NSM_HEADING).toBe("North Star Metric");
  });
  it("travels with every computed figure", () => {
    expect(computeNsm(input([])).label).toBe(NSM_LABEL);
  });
});
