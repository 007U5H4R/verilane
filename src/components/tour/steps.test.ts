import { describe, expect, it } from "vitest";
import { TOUR_STEPS, currentStage, isStepComplete, type TourSnapshot, type TourStep } from "./steps";

function at(i: number): TourStep {
  const step = TOUR_STEPS[i];
  if (!step) throw new Error(`no step ${i}`);
  return step;
}

const PITCHES = [
  "Most collections tools chase everyone, harder. Verilane ranks every open invoice by what is actually at stake: how late it is, how big it is, and whether the customer has broken a promise.",
  "Sometimes the smartest action is to not send a reminder. This customer says they've already paid and the ledger hasn't caught up yet, so Verilane holds the invoice for reconciliation instead of sending an awkward reminder.",
  "Here is why this invoice is at the top: it is 47 days late, the amount is ₹3.4L, and the customer missed a payment date they promised. Each reason links to the email it came from.",
  "Copilot wrote the reminder, but before anyone can send it, the draft is checked nine ways: the amount, the dates, the payments and the tone are all compared against your ledger. A draft that fails any check can't be approved.",
  "AI drafts, and a person decides. Nothing goes to a customer until someone with the right authority approves it. Switch to Manager, the senior person, and approve it.",
  "Want to stop clicking approve on every small reminder? As a Manager, you can let Copilot send the lowest-risk ones by itself. The draft has to pass all nine checks and stay under a cap you choose, and switching it off takes one click.",
  "Now switch back to Analyst, the person doing the day-to-day work. Here is a ₹40,000 reminder that passes every check. Submit it, and Copilot sends it within a second, under the rules you just set. Anything over the cap, or anything with a failed check, waits for a person and shows the reason.",
  "Your approval and Copilot's send are both in the log, each with who did it, why, and the evidence behind it. Verilane gives you clarity and control over your receivables, without blindly trusting AI.",
];

const base: TourSnapshot = { role: "analyst", autopilotEnabled: false, draftA: null, draftB: null };

describe("TOUR_STEPS", () => {
  it("has eight steps whose pitches are the approved copy, verbatim", () => {
    expect(TOUR_STEPS).toHaveLength(8);
    expect(TOUR_STEPS.map((s) => s.pitch)).toEqual(PITCHES);
  });

  it("step 3 completes once an INV-A draft exists", () => {
    expect(isStepComplete(at(2), base)).toBe(false);
    expect(isStepComplete(at(2), { ...base, draftA: { status: "generated" } })).toBe(true);
  });

  it("step 4 completes when the INV-A draft is submitted (validated)", () => {
    expect(isStepComplete(at(3), { ...base, draftA: { status: "generated" } })).toBe(false);
    expect(isStepComplete(at(3), { ...base, draftA: { status: "validated" } })).toBe(true);
  });

  it("step 5 completes only when a person sent INV-A", () => {
    const step = at(4);
    expect(isStepComplete(step, { ...base, draftA: { status: "validated" } })).toBe(false);
    expect(isStepComplete(step, { ...base, draftA: { status: "sent_simulated", sent_by: "copilot" } })).toBe(false);
    expect(isStepComplete(step, { ...base, draftA: { status: "sent_simulated", sent_by: "human" } })).toBe(true);
  });

  it("step 6 completes when autopilot is on", () => {
    expect(isStepComplete(at(5), base)).toBe(false);
    expect(isStepComplete(at(5), { ...base, autopilotEnabled: true })).toBe(true);
  });

  it("step 7 completes only when Copilot sent INV-B", () => {
    const step = at(6);
    expect(isStepComplete(step, { ...base, draftB: { status: "sent_simulated", sent_by: "human" } })).toBe(false);
    expect(isStepComplete(step, { ...base, draftB: { status: "sent_simulated", sent_by: "copilot" } })).toBe(true);
  });

  it("look-only steps never complete by themselves", () => {
    for (const i of [0, 1, 7]) expect(isStepComplete(at(i), base)).toBe(false);
  });
});

describe("currentStage", () => {
  it("step 5 asks an Analyst to switch role first", () => {
    const r = currentStage(at(4), { ...base, draftA: { status: "validated" } }, "/invoices/INV-A", 0);
    expect(r.stage.target).toBe("[data-tour=role-switcher]");
  });

  it("step 5 points a Manager at Approve & send on INV-A", () => {
    const r = currentStage(at(4), { ...base, role: "manager" }, "/invoices/INV-A", 0);
    expect(r).toEqual({ kind: "stage", stage: expect.objectContaining({ target: "[data-testid=primary-action]" }) });
  });

  it("step 6 off /settings says how to get there", () => {
    const r = currentStage(at(5), { ...base, role: "manager" }, "/drafts", 0);
    expect(r.kind).toBe("wrong-page");
    expect(r.stage.navHint?.label).toBe("Settings");
  });

  it("step 2 moves from the INV-D row to the INV-A link on the next substage", () => {
    expect(currentStage(at(1), base, "/queue", 0).stage.target).toBe("[data-tour=queue-row-INV-D]");
    expect(currentStage(at(1), base, "/queue", 1).stage.target).toBe('a[href="/invoices/INV-A"]');
  });

  it("the invoice route matches exactly", () => {
    expect(currentStage(at(2), base, "/invoices/INV-A", 0).kind).toBe("stage");
    expect(currentStage(at(2), base, "/invoices/INV-B", 0).kind).toBe("wrong-page");
  });

  it("when every stage is done it stays on the last one", () => {
    const s: TourSnapshot = { ...base, draftB: { status: "sent_simulated", sent_by: "copilot" } };
    const r = currentStage(at(6), s, "/invoices/INV-B", 0);
    const last = at(6).stages.at(-1)!;
    expect(r.stage.target).toBe(last.target);
  });
});
