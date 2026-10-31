/**
 * TASK-23 fix round 1 (T23-9): eval:live re-validates every live result with
 * `validateExtraction` (same as the app path), and its cost notice uses
 * Opus 5.5 rates ($4 input / $20 output per million tokens).
 */
import { describe, expect, it } from "vitest";

import type { EmailMessage } from "@/domain/schema";
import { estimateCostUsd, toReportRow } from "./eval-live-report";

const msg: EmailMessage = {
  thread_id: "E-900",
  message_id: "E-900-1",
  from_address: "ap@example.com",
  sent_at: "2026-10-28T09:00:00Z",
  subject: "INV-9001",
  body: "We will pay INV-9001 on 2026-11-05.",
};

const validRow = {
  message_id: "E-900-1",
  thread_id: "E-900",
  mode: "live",
  provider: "live",
  schemaVersion: "extraction.v1",
  email_class: "commitment",
  signals: [],
  invoice_refs: ["INV-9001"],
  amounts: [],
  dates: ["2026-11-05"],
  commitment_date: "2026-11-05",
  payment_claim: null,
  missing_info: [],
  status: "valid",
};

describe("eval:live report rows (T23-9)", () => {
  it("a schema-valid live result is reported ok", () => {
    const row = toReportRow(msg, { ok: true, value: validRow });
    expect(row).toEqual({ message_id: "E-900-1", thread_id: "E-900", ok: true, value: validRow });
  });

  it("a live result that fails validateExtraction is reported as rejected", () => {
    const row = toReportRow(msg, { ok: true, value: { ...validRow, dates: ["05/11/2026"] } });
    expect(row.ok).toBe(false);
    expect(row.error?.reason).toBe("schema validation failed");
  });

  it("an already-rejected live call is reported as-is", () => {
    const error = { message_id: "E-900-1", reason: "model refused the request", issues: [] };
    expect(toReportRow(msg, { ok: false, error })).toEqual({
      message_id: "E-900-1",
      thread_id: "E-900",
      ok: false,
      error,
    });
  });
});

describe("eval:live cost estimate (T23-9)", () => {
  it("uses Opus 5.5 rates: 400 in @ $4/M + 200 out @ $20/M per call", () => {
    // per call: 400 * 4 / 1e6 + 200 * 20 / 1e6 = 0.0016 + 0.004 = 0.0056
    expect(estimateCostUsd(1000)).toBeCloseTo(5.6, 10);
  });
});
