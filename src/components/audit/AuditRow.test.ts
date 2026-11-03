import { describe, expect, it } from "vitest";
import { actionLabel, formatAt } from "./AuditRow";

// R7: audit times render in Asia/Kolkata whatever the machine's zone is.
describe("formatAt", () => {
  it("formats an instant in Asia/Kolkata", () => {
    expect(formatAt("2026-10-30T10:05:00Z")).toBe("30 Oct 2026, 03:35 pm");
  });

  it("shows an em dash for a missing time", () => {
    expect(formatAt(undefined)).toBe("—");
  });
});

describe("actionLabel", () => {
  it("labels a blocked approval (TASK-16)", () => {
    expect(actionLabel("validation_failure")).toBe("Approval blocked: checks failed");
  });

  it("falls back to the action with spaces", () => {
    expect(actionLabel("some_new_action")).toBe("some new action");
  });
});
