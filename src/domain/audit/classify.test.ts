import { describe, expect, it } from "vitest";
import { ACTIONS } from "@/domain/permissions";
import { ACTION_META, MODULES, actorOf, actorType, describe as describeEvent, isAuditAction, labelFor } from "./classify";

const EXTRA = ["import_rejected", "demo_reset", "validation_failure", "autopilot_held"] as const;
const ALL = [...ACTIONS, ...EXTRA];

describe("audit classification (central mapping)", () => {
  it("covers every recorded action exactly once, and nothing else", () => {
    expect(Object.keys(ACTION_META).sort()).toEqual([...new Set(ALL)].sort());
    for (const a of ALL) expect(isAuditAction(a)).toBe(true);
    expect(isAuditAction("note")).toBe(false);
    expect(isAuditAction("toString")).toBe(false);
  });

  it("gives every action a label and a module that exists", () => {
    for (const a of ALL) {
      const m = ACTION_META[a];
      expect(m.label.length).toBeGreaterThan(0);
      expect(MODULES[m.module]).toBeDefined();
    }
  });

  it("keeps the existing Activity-log labels", () => {
    expect(labelFor("validation_failure")).toBe("Approval blocked: checks failed");
    expect(labelFor("add_note")).toBe("Note");
    expect(labelFor("some_legacy_thing")).toBe("some legacy thing");
  });

  it("counts only approve / reject / blocked-approval (and Copilot's send / hold) as approvals", () => {
    const approvals = ALL.filter((a) => ACTION_META[a].category === "approval").sort();
    expect(approvals).toEqual(["approve_draft", "autopilot_held", "autopilot_send", "reject_draft", "validation_failure"]);
  });

  it("attributes Copilot autopilot rows to Copilot, never to a person (TASK-41)", () => {
    for (const action of ["autopilot_send", "autopilot_held"]) {
      const e = { action, actor_role: "analyst", actor_label: "Copilot (autopilot)" };
      expect(actorType(e)).toBe("copilot");
      expect(actorOf(e)).toEqual({ type: "copilot", name: "Copilot", role: "Copilot (autopilot)", key: "copilot" });
    }
  });

  it("is a human action only when a role was recorded", () => {
    expect(actorType({ action: "approve_draft", actor_role: "manager" })).toBe("human");
    expect(actorType({ action: "approve_draft" })).toBe("unknown");
    expect(actorType({ action: "approve_draft", actor_role: "robot" })).toBe("unknown");
  });

  it("treats a rejected email extraction as automated processing, not a person", () => {
    const e = { action: "validation_failure", subject_kind: "review", actor_role: "analyst", actor_label: "Analyst" };
    expect(actorType(e)).toBe("system");
    expect(describeEvent(e).label).toBe("Email extraction rejected");
    expect(describeEvent(e).category).toBe("review");
    expect(actorOf(e)).toEqual({ type: "system", name: "System", role: "Analyst", key: "system" });
  });

  it("an approval blocked on a draft stays a human approval attempt", () => {
    const e = { action: "validation_failure", subject_kind: "draft", actor_role: "manager", actor_label: "Manager" };
    expect(actorType(e)).toBe("human");
    expect(describeEvent(e).category).toBe("approval");
  });

  it("renders unknown / legacy rows safely without guessing", () => {
    const legacy = { action: "note" };
    const d = describeEvent(legacy);
    expect(d.known).toBe(false);
    expect(d.module).toBe("unknown");
    expect(d.category).toBe("unknown");
    expect(actorOf(legacy)).toEqual({ type: "unknown", name: "Not recorded", role: null, key: "unknown" });
  });

  it("names a human actor by the recorded role label", () => {
    expect(actorOf({ action: "switch_role", actor_role: "manager", actor_label: "Manager" })).toEqual({
      type: "human",
      name: "Manager",
      role: "Manager",
      key: "manager",
    });
  });
});
