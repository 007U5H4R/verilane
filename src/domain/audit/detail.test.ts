import { describe, expect, it } from "vitest";
import { changeRows, metadataOf, relatedRefs, resultOf } from "./detail";

describe("relatedRefs", () => {
  it("uses the recorded invoice_id for a draft event", () => {
    expect(relatedRefs({ subjectKind: "draft", subjectId: "D-1", invoiceId: "INV-1" })).toEqual({
      invoiceId: "INV-1",
      disputeId: null,
      draftId: "D-1",
      reviewId: null,
    });
  });

  it("takes an invoice subject as the invoice", () => {
    expect(relatedRefs({ subjectKind: "invoice", subjectId: "INV-2", invoiceId: null }).invoiceId).toBe("INV-2");
  });

  it("points at nothing for a workspace event", () => {
    expect(relatedRefs({ subjectKind: "system", subjectId: "workspace", invoiceId: null })).toEqual({
      invoiceId: null,
      disputeId: null,
      draftId: null,
      reviewId: null,
    });
  });
});

describe("changeRows", () => {
  it("is empty when nothing was recorded", () => {
    expect(changeRows({})).toEqual([]);
    expect(changeRows({ before: "x", after: [1] })).toEqual([]);
  });

  it("pairs previous and new values per field", () => {
    expect(changeRows({ before: { status: "open" }, after: { status: "resolved", note_id: 3 } })).toEqual([
      { field: "status", before: "open", after: "resolved" },
      { field: "note id", before: "—", after: "3" },
    ]);
  });
});

describe("resultOf / metadataOf", () => {
  it("reads only recorded values", () => {
    expect(resultOf({ after: { status: "approved_simulated" } })).toBe("approved simulated");
    expect(resultOf({})).toBeNull();
    expect(metadataOf({ actor_role: "manager", evidence_ids: ["E1", 2] })).toEqual({
      correlationId: null,
      actorId: "manager",
      source: null,
      schemaVersion: null,
      evidence: ["E1"],
    });
  });
});
