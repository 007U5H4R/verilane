import { describe, expect, it } from "vitest";
import type { EmailMessage } from "@/domain/schema";
import { simulateExtraction, simulatedProvider } from "./simulated";
import { rejectedExtraction, validateExtraction } from "./validateExtraction";

const msg: EmailMessage = {
  thread_id: "E-007",
  message_id: "E-007-1",
  from_address: "ap@example.com",
  sent_at: "2026-10-28T09:00:00Z",
  subject: "INV-1042",
  body: "We paid INV-1042 on 27/10/2026, ₹3,00,000 via NEFT.",
};

describe("simulated provider (TASK-12.4)", () => {
  it("stamps mode, provider and schema version, and passes Zod", async () => {
    const result = await simulatedProvider.extract(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      message_id: "E-007-1",
      thread_id: "E-007",
      mode: "simulated",
      provider: "simulated",
      schemaVersion: "extraction.v1",
      email_class: "confirmation",
      invoice_refs: ["INV-1042"],
      amounts: [30_000_000],
      dates: ["2026-10-27"],
      commitment_date: "2026-10-27",
      status: "valid",
    });
  });

  it("simulateExtraction returns the same validated row synchronously", async () => {
    const result = await simulatedProvider.extract(msg);
    expect(result.ok && result.value).toEqual(simulateExtraction(msg));
  });

  it("an email with no signals is a valid 'unknown' extraction", () => {
    const x = simulateExtraction({ ...msg, body: "Thanks, noted." });
    expect(x.status).toBe("valid");
    expect(x.email_class).toBe("unknown");
    expect(x.invoice_refs).toEqual([]);
  });
});

describe("validateExtraction (SR5)", () => {
  it("refuses an output that breaks the schema, with the issue paths", () => {
    const bad = { ...simulateExtraction(msg), email_class: "dispute", amounts: [-5] };
    const result = validateExtraction(bad, msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message_id).toBe("E-007-1");
    expect(result.error.issues.some((i) => i.startsWith("amounts.0"))).toBe(true);
    expect(result.error.issues.some((i) => i.startsWith("dispute_type"))).toBe(true);
  });

  it("refuses a non-object", () => {
    expect(validateExtraction("nope", msg).ok).toBe(false);
  });

  it("a rejected row is itself schema-valid and carries no facts", () => {
    const row = rejectedExtraction(msg, "simulated", "simulated", {
      message_id: msg.message_id,
      reason: "schema validation failed",
      issues: ["amounts.0: too small"],
    });
    expect(validateExtraction(row, msg).ok).toBe(true);
    expect(row).toMatchObject({ status: "rejected", email_class: "unknown", amounts: [] });
    expect(row.rejection_reason).toContain("amounts.0");
  });
});
