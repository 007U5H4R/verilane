import { describe, expect, it } from "vitest";
import {
  IllegalTransition,
  MACHINES,
  transition,
  type Machine,
} from "./transitions";

/**
 * Documented legal transitions (Data-Model state machines). Every pair not
 * listed here must throw IllegalTransition (TC-036).
 */
const LEGAL: Record<Machine, Array<[from: string, event: string, to: string]>> =
  {
    invoice: [
      ["active", "mark_disputed", "disputed"],
      ["disputed", "release", "active"],
    ],
    dispute: [
      ["new", "start_review", "under_review"],
      ["under_review", "await_customer", "awaiting_customer"],
      ["awaiting_customer", "customer_replied", "under_review"],
      ["under_review", "resolve", "resolved"],
      ["under_review", "reject", "rejected"],
    ],
    draft: [
      ["generated", "edit", "edited"],
      ["edited", "edit", "edited"],
      ["validated", "edit", "edited"],
      ["blocked", "edit", "edited"],
      ["generated", "validate_pass", "validated"],
      ["edited", "validate_pass", "validated"],
      ["generated", "validate_fail", "blocked"],
      ["edited", "validate_fail", "blocked"],
      ["validated", "approve", "approved"],
      ["approved", "send", "sent_simulated"],
      ["generated", "reject", "rejected"],
      ["edited", "reject", "rejected"],
      ["validated", "reject", "rejected"],
      ["blocked", "reject", "rejected"],
    ],
    review: [
      ["open", "action", "actioned"],
      ["open", "dismiss", "dismissed"],
    ],
  };

describe("transitions (TC-036)", () => {
  it("covers every machine", () => {
    expect(Object.keys(LEGAL).sort()).toEqual(Object.keys(MACHINES).sort());
  });

  for (const machine of Object.keys(MACHINES) as Machine[]) {
    const { states, events } = MACHINES[machine];
    const legal = new Map(LEGAL[machine].map(([f, e, t]) => [`${f}|${e}`, t]));

    it(`${machine}: legal table only uses declared states/events`, () => {
      for (const [f, e, t] of LEGAL[machine]) {
        expect(states).toContain(f);
        expect(states).toContain(t);
        expect(events).toContain(e);
      }
    });

    for (const from of states) {
      for (const event of events) {
        const to = legal.get(`${from}|${event}`);
        if (to) {
          it(`${machine}: ${from} --${event}--> ${to}`, () => {
            expect(transition(machine, from, event)).toBe(to);
          });
        } else {
          it(`${machine}: ${from} --${event}--> IllegalTransition`, () => {
            expect(() => transition(machine, from, event)).toThrow(
              IllegalTransition,
            );
          });
        }
      }
    }
  }

  it("unknown states and events are illegal", () => {
    expect(() => transition("draft", "nope", "approve")).toThrow(
      IllegalTransition,
    );
    expect(() => transition("draft", "validated", "nope")).toThrow(
      IllegalTransition,
    );
  });

  it("IllegalTransition carries a readable message and the pair", () => {
    try {
      transition("dispute", "resolved", "start_review");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalTransition);
      const err = e as IllegalTransition;
      expect(err.machine).toBe("dispute");
      expect(err.from).toBe("resolved");
      expect(err.event).toBe("start_review");
      expect(err.message).toMatch(/resolved/);
    }
  });
});
