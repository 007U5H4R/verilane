import { describe, expect, it } from "vitest";
import { actionLabel } from "./AuditRow";

describe("actionLabel", () => {
  it("labels a blocked approval (TASK-16)", () => {
    expect(actionLabel("validation_failure")).toBe("Approval blocked: checks failed");
  });

  it("falls back to the action with spaces", () => {
    expect(actionLabel("some_new_action")).toBe("some new action");
  });
});
