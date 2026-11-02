import { describe, expect, it } from "vitest";
import { DraftSchema, type Draft } from "@/domain/schema";
import { toTourDraft } from "./tourDraft";

const d = (over: Record<string, unknown>) => ({ draft_id: "D1", invoice_id: "INV-A", status: "generated", ...over }) as unknown as Draft;

describe("toTourDraft", () => {
  it("is null without a draft", () => expect(toTourDraft(null)).toBeNull());
  it("a human send (no sent_by on the row) reads as human", () =>
    expect(toTourDraft(d({ status: "sent_simulated" }))).toEqual({ status: "sent_simulated", sent_by: "human" }));
  it("a Copilot send reads as copilot", () =>
    expect(toTourDraft(d({ status: "sent_simulated", sent_by: "copilot" }))).toEqual({ status: "sent_simulated", sent_by: "copilot" }));
  it("an unsent draft has no sender", () => expect(toTourDraft(d({ status: "validated" }))).toEqual({ status: "validated" }));
});

// Scar (TASK-44 e2e): hooks read drafts through DraftSchema.safeParse, and a
// plain z.object strips unknown keys, so a Copilot send reached the tour
// without `sent_by`, read as a human send, and step 7 never advanced.
describe("a draft read back through DraftSchema", () => {
  const row = {
    draft_id: "D1",
    invoice_id: "INV-B",
    customer_id: "C-1",
    status: "sent_simulated",
    subject: "",
    body: "",
    facts: [],
    footnotes: [],
    amount_paise: 1,
    ambiguous_match: false,
    conflicting_payment: false,
    checks: [],
    failed_checks: [],
    created_at: "2026-11-02T00:00:00.000Z",
    sent_by: "copilot",
  };
  it("keeps Copilot as the sender", () => {
    const parsed = DraftSchema.safeParse(row);
    expect(parsed.success).toBe(true);
    expect(toTourDraft(parsed.success ? parsed.data : null)).toEqual({ status: "sent_simulated", sent_by: "copilot" });
  });
});
