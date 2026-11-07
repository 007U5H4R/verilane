/**
 * TASK-79.1 (TKT-75.01) · TC-002: `Exception.kind` gains the two payment
 * kinds, and `message_id` is optional for those only — every email-raised
 * (v1 data-issue) kind still requires the email that raised it.
 */
import { describe, expect, it } from "vitest";
import { ExceptionKindSchema, ExceptionSchema, PAYMENT_EXCEPTION_KINDS } from "./schema";

const base = {
  review_id: "EX-001",
  linked_review_ids: [],
  recommendation: "",
  evidence_ids: [],
  validation_status: "verified",
  escalation_reason: "",
  requires_role: "analyst",
  status: "open",
} as const;

describe("Exception schema (TC-002)", () => {
  it("accepts the two new payment kinds", () => {
    expect(ExceptionKindSchema.options).toEqual(
      expect.arrayContaining(["unallocated_payment", "short_payment_pattern"]),
    );
    expect(PAYMENT_EXCEPTION_KINDS).toEqual(["unallocated_payment", "short_payment_pattern"]);
  });

  it.each(["unallocated_payment", "short_payment_pattern"] as const)(
    "%s parses without a message_id and keeps its kind",
    (kind) => {
      const parsed = ExceptionSchema.parse({ ...base, kind });
      expect(parsed.kind).toBe(kind);
      expect(parsed.message_id).toBeUndefined();
    },
  );

  it("a payment kind may still cite an email", () => {
    expect(ExceptionSchema.parse({ ...base, kind: "unallocated_payment", message_id: "E-1" }).message_id).toBe("E-1");
  });

  it.each(["draft", "uncertain_match", "dispute", "missing_info", "reconciliation"] as const)(
    "%s still requires message_id",
    (kind) => {
      const result = ExceptionSchema.safeParse({ ...base, kind });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["message_id"]);
      expect(ExceptionSchema.safeParse({ ...base, kind, message_id: "" }).success).toBe(false);
      expect(ExceptionSchema.parse({ ...base, kind, message_id: "E-1" }).message_id).toBe("E-1");
    },
  );

  it("rejects an unknown kind", () => {
    expect(ExceptionSchema.safeParse({ ...base, kind: "nope", message_id: "E-1" }).success).toBe(false);
  });
});
