/** TASK-41 · Copilot autopilot eligibility: the trust gates, in order. */
import { describe, expect, it } from "vitest";
import { autopilotEligibility, DEFAULT_AUTOPILOT, isValidCap, MAX_AUTOPILOT_CAP, parsePolicy } from "./autopilot";
import { paise } from "./money";

const ON = { enabled: true, max_amount_paise: paise(5_000_000) };
const ok = { draft_id: "DR-1", status: "validated", amount_paise: 1_000_000, failed_checks: [] };

describe("autopilotEligibility", () => {
  it("sends a validated, clean draft within the cap, with the full decision trace", () => {
    const r = autopilotEligibility(ok, ON);
    expect(r.eligible).toBe(true);
    expect(r.passed).toEqual([
      "Autopilot is on",
      "All nine checks pass",
      "Amount within the ₹50,000.00 cap",
      "Within Analyst approval authority",
    ]);
  });

  it.each([
    ["policy off", ok, DEFAULT_AUTOPILOT, /off/],
    ["not submitted", { ...ok, status: "edited" }, ON, /Not submitted/],
    ["already sent", { ...ok, status: "sent_simulated" }, ON, /Not submitted/],
    ["a failed check", { ...ok, failed_checks: ["amount"] }, ON, /1 check failed/],
    ["amount unknown", { ...ok, amount_paise: undefined }, ON, /Amount unknown/],
    ["over the cap", { ...ok, amount_paise: 5_000_001 }, ON, /Over the ₹50,000.00 autopilot cap/],
    ["ambiguous match", { ...ok, ambiguous_match: true }, ON, /\w/],
    ["conflicting payment", { ...ok, conflicting_payment: true }, ON, /\w/],
    ["manager escalation", { ...ok, requires_role: "manager" }, ON, /\w/],
  ])("holds a draft with %s", (_name, draft, policy, reason) => {
    const r = autopilotEligibility(draft, policy);
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toMatch(reason);
  });

  it("never exceeds Analyst authority even if the cap equals the Manager threshold", () => {
    const r = autopilotEligibility(
      { ...ok, amount_paise: MAX_AUTOPILOT_CAP, ambiguous_match: true },
      { enabled: true, max_amount_paise: MAX_AUTOPILOT_CAP },
    );
    expect(r.eligible).toBe(false);
  });
});

describe("policy parsing", () => {
  it("falls back to the off default on malformed input", () => {
    expect(parsePolicy(undefined)).toEqual(DEFAULT_AUTOPILOT);
    expect(parsePolicy("on")).toEqual(DEFAULT_AUTOPILOT);
    expect(parsePolicy({ enabled: "yes", max_amount_paise: -5 })).toEqual(DEFAULT_AUTOPILOT);
  });

  it("caps are positive integers no larger than the Analyst threshold", () => {
    expect(isValidCap(1)).toBe(true);
    expect(isValidCap(MAX_AUTOPILOT_CAP)).toBe(true);
    expect(isValidCap(MAX_AUTOPILOT_CAP + 1)).toBe(false);
    expect(isValidCap(0)).toBe(false);
    expect(isValidCap(1.5)).toBe(false);
  });
});
