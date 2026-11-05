import { describe, expect, it } from "vitest";
import { deriveSignals, type SignalInput } from "./signals";
import { EXTRACTION_SCHEMA_VERSION, type Exception, type Extraction, type Match } from "./schema";

function ext(message_id: string, overrides: Partial<Extraction> = {}): Extraction {
  return {
    message_id,
    thread_id: message_id.replace(/-\d+$/, ""),
    mode: "simulated",
    provider: "simulated",
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    email_class: "commitment",
    signals: [],
    invoice_refs: [],
    amounts: [],
    dates: [],
    commitment_date: null,
    payment_claim: null,
    missing_info: [],
    status: "valid",
    ...overrides,
  };
}

function matched(message_id: string, invoice_id: string, candidates = [invoice_id]): Match {
  return { message_id, outcome: "matched", customer_id: "C-1", invoice_id, candidates, reason: "r" };
}

function input(overrides: Partial<SignalInput>): SignalInput {
  return { asOf: "2026-10-30", extractions: [], matches: [], disputes: [], ...overrides };
}

describe("deriveSignals", () => {
  it("TC-029: a matched dispute email → disputed, cited by its email_class evidence id", () => {
    const s = deriveSignals(
      input({
        extractions: [ext("E-011-1", { email_class: "dispute", dispute_type: "incorrect_amount" })],
        matches: [matched("E-011-1", "INV-015")],
      }),
    );
    expect(s.disputed?.get("INV-015")).toBe("E-011-1:emails.json:email_class");
  });

  it("an open Dispute record → disputed; a resolved one does not", () => {
    const s = deriveSignals(
      input({
        disputes: [
          { dispute_id: "D-1", invoice_id: "INV-C", status: "under_review", type: "incorrect_amount" },
          { dispute_id: "D-2", invoice_id: "INV-X", status: "resolved", type: "incorrect_amount" },
        ],
      }),
    );
    expect(s.disputed?.get("INV-C")).toBe("dispute D-1");
    expect(s.disputed?.has("INV-X")).toBe(false);
  });

  it("a dispute email stops gating once its Dispute record is resolved", () => {
    const s = deriveSignals(
      input({
        extractions: [ext("E-011-1", { email_class: "dispute", dispute_type: "incorrect_amount" })],
        matches: [matched("E-011-1", "INV-015")],
        disputes: [{ dispute_id: "D-1", invoice_id: "INV-015", status: "resolved", type: "incorrect_amount" }],
      }),
    );
    expect(s.disputed?.has("INV-015")).toBe(false);
  });

  it("TC-030: a matched payment claim → holdReconcile", () => {
    const s = deriveSignals(
      input({
        extractions: [
          ext("E-007-1", {
            email_class: "confirmation",
            amounts: [30_000_000],
            payment_claim: { paid_on: "2026-10-27", amount_paise: 30_000_000 },
          }),
        ],
        matches: [matched("E-007-1", "INV-042")],
      }),
    );
    expect(s.holdReconcile?.get("INV-042")).toBe("E-007-1:emails.json:email_class");
  });

  it("TC-033 (FS6): a duplicate claim puts every candidate invoice on hold", () => {
    const s = deriveSignals(
      input({
        extractions: [ext("E-016-1", { email_class: "duplicate", dispute_type: "duplicate_invoice" })],
        matches: [matched("E-016-1", "INV-024", ["INV-023", "INV-024"])],
      }),
    );
    expect(s.holdReconcile?.get("INV-023")).toBe("E-016-1:emails.json:email_class");
    expect(s.holdReconcile?.get("INV-024")).toBe("E-016-1:emails.json:email_class");
  });

  it("TC-031: a commitment is active through commitment_date + 3, broken after", () => {
    const base = {
      extractions: [ext("E-001-1", { commitment_date: "2026-10-28" })],
      matches: [matched("E-001-1", "INV-012")],
    };
    for (const asOf of ["2026-10-30", "2026-10-31"]) {
      const s = deriveSignals(input({ ...base, asOf }));
      expect(s.activeCommitment?.get("INV-012")).toBe("E-001-1:emails.json:commitment_date");
      expect(s.brokenPromise?.has("INV-012")).toBe(false);
    }
    const late = deriveSignals(input({ ...base, asOf: "2026-11-01" }));
    expect(late.activeCommitment?.has("INV-012")).toBe(false);
    expect(late.brokenPromise?.get("INV-012")).toBe("E-001-1:emails.json:commitment_date");
  });

  it("a later active promise outranks an earlier broken one on the same invoice", () => {
    const s = deriveSignals(
      input({
        extractions: [
          ext("E-1-1", { commitment_date: "2026-10-01" }),
          ext("E-2-1", { commitment_date: "2026-11-05" }),
        ],
        matches: [matched("E-1-1", "INV-1"), matched("E-2-1", "INV-1")],
      }),
    );
    expect(s.activeCommitment?.has("INV-1")).toBe(true);
    expect(s.brokenPromise?.has("INV-1")).toBe(false);
  });

  it("unmatched or rejected emails never raise a signal", () => {
    const s = deriveSignals(
      input({
        extractions: [
          ext("E-024-1", { email_class: "dispute", dispute_type: "unknown" }),
          ext("E-9-1", { email_class: "dispute", dispute_type: "unknown", status: "rejected", rejection_reason: "x" }),
        ],
        matches: [
          { message_id: "E-024-1", outcome: "ambiguous", candidates: ["INV-024"], reason: "r" },
          matched("E-9-1", "INV-9"),
        ],
      }),
    );
    expect(s.disputed?.size ?? 0).toBe(0);
  });
});

describe("deriveSignals — related unapplied cash holds reminders (TC-75.10)", () => {
  const unallocated = (status: Exception["status"], candidates: string[]): Exception => ({
    review_id: "RV-PAY-P-9",
    kind: "unallocated_payment",
    payment_id: "P-9",
    candidate_invoice_ids: candidates,
    linked_review_ids: [],
    recommendation: "",
    evidence_ids: [],
    validation_status: candidates.length === 1 ? "verified" : "conflict",
    escalation_reason: "",
    requires_role: "analyst",
    status,
  });

  it("an open unallocated_payment holds every candidate at G5, cited by the bank line", () => {
    const s = deriveSignals(input({ exceptions: [unallocated("open", ["INV-1", "INV-2"])] }));
    expect(s.holdReconcile?.get("INV-1")).toBe("P-9:payments.csv:invoice_id");
    expect(s.holdReconcile?.get("INV-2")).toBe("P-9:payments.csv:invoice_id");
  });

  it("an actioned or dismissed one holds nothing", () => {
    for (const status of ["actioned", "dismissed"] as const) {
      const s = deriveSignals(input({ exceptions: [unallocated(status, ["INV-1"])] }));
      expect(s.holdReconcile?.has("INV-1")).toBe(false);
    }
  });
});
