import { describe, expect, it } from "vitest";

import { TOUR_STEPS, type TourSnapshot } from "./steps";
import { backState, nextState, routeAdvance } from "./tourNav";

const base: TourSnapshot = { role: "analyst", autopilotEnabled: false, draftA: null, draftB: null };
const run = (step: number, substage = 0) => ({ phase: "running" as const, step, substage });

describe("nextState", () => {
  it("moves to the next stage inside a step before the next step", () => {
    expect(nextState(run(1, 0), base)).toEqual(run(1, 1));
    expect(nextState(run(1, 1), base)).toEqual(run(2, 0));
  });

  it("counts from the stage actually shown, skipping stages already done", () => {
    // Step 5, already a Manager: the role stage is done, so the viewer sees stage 2.
    expect(nextState(run(4, 0), { ...base, role: "manager" })).toEqual(run(5, 0));
  });

  it("finishes after the last step", () => {
    expect(nextState(run(TOUR_STEPS.length - 1), base)).toEqual({ phase: "finished", step: TOUR_STEPS.length - 1, substage: 0 });
  });
});

describe("backState", () => {
  it("goes to the previous step's start and never below step 1", () => {
    expect(backState(run(3, 1))).toEqual(run(2, 0));
    expect(backState(run(0, 0))).toEqual(run(0, 0));
  });
});

describe("routeAdvance", () => {
  it("advances a look-only step when the viewer lands on the next step's page", () => {
    expect(routeAdvance(run(1, 1), "/invoices/INV-A")).toEqual(run(2, 0));
  });

  it("does nothing on the step's own page, on unrelated pages, or on action steps", () => {
    expect(routeAdvance(run(1, 1), "/queue")).toBeNull();
    expect(routeAdvance(run(1, 1), "/settings")).toBeNull();
    expect(routeAdvance(run(0, 0), "/queue")).toBeNull();
    expect(routeAdvance(run(4, 1), "/settings")).toBeNull();
  });
});
