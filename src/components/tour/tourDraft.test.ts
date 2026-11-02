import { describe, expect, it } from "vitest";
import type { Draft } from "@/domain/schema";
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
