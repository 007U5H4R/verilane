/**
 * Fault injection (TASK-22.3, FS11, TC-070/TC-071). Every seed email is run
 * through the pipeline once per fault kind with only that email corrupted.
 * Each corrupted output must be rejected, sent to review with one
 * `validation_failure` audit event, and no invoice it could concern may end
 * with an approvable draft (approved through the real `approve_draft`).
 */
import { beforeAll, describe, expect, test } from "vitest";
import { FAULT_KINDS } from "@/ai/faulty";
import { runFaults, type FaultReport } from "./run";

let report: FaultReport;

beforeAll(async () => {
  report = await runFaults();
});

describe("fault injection (TC-070, TC-071)", () => {
  test("covers all six kinds over every seed email", () => {
    expect(report.kinds.map((k) => k.kind)).toEqual([...FAULT_KINDS]);
    for (const k of report.kinds) expect(k.emails).toBe(25);
  });

  for (const kind of FAULT_KINDS) {
    describe(kind, () => {
      const result = () => {
        const r = report.kinds.find((k) => k.kind === kind);
        if (!r) throw new Error(`no result for ${kind}`);
        return r;
      };

      test("every corrupted output is rejected (rate 100%)", () => {
        const r = result();
        expect(r.rejected, r.failures.join("; ")).toBe(r.emails);
        expect(r.rate).toBe(1);
      });

      test("every rejection is in review with one validation_failure audit (TC-070)", () => {
        const r = result();
        expect(r.needs_review, r.failures.join("; ")).toBe(r.emails);
        expect(r.audited, r.failures.join("; ")).toBe(r.emails);
      });

      test("no rejected email leaves an approvable draft (TC-071)", () => {
        const r = result();
        expect(r.approvals_attempted).toBeGreaterThan(0);
        expect(r.approvable, r.failures.join("; ")).toBe(0);
      });
    });
  }

  test("overall: rate 100%, nothing approvable", () => {
    expect(report.rate).toBe(1);
    expect(report.approvable).toBe(0);
  });
});
