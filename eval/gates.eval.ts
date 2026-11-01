/**
 * The gated eval (TASK-21.3, TC-065 seed, TC-066 held-out).
 *
 * Runs the whole pipeline once, writes `report.json` and `report.md`, then
 * asserts every gate on both sets. A missed gate fails its test, so
 * `pnpm eval` exits non-zero. VERILANE_EVAL_REPORT_DIR redirects the report
 * (the forced-miss child run uses it so the committed report isn't touched).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { GATE_DEFS, runEval, toJson, toMarkdown, type Report, type SetName } from "./run";

const REPORT_DIR = process.env.VERILANE_EVAL_REPORT_DIR ?? join(process.cwd(), "eval");

let report: Report;

beforeAll(async () => {
  report = await runEval();
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, "report.json"), toJson(report));
  writeFileSync(join(REPORT_DIR, "report.md"), toMarkdown(report));
});

function gateTests(set: SetName): void {
  for (const def of GATE_DEFS) {
    test(def.name, () => {
      const gate = report.gates.find((g) => g.set === set && g.name === def.name);
      if (!gate) throw new Error(`no ${set} gate named ${def.name}`);
      const failing = gate.failures.length > 0 ? ` — failing: ${gate.failures.join(", ")}` : "";
      expect(gate.passed, `${def.name} (${set}) ${gate.value} vs ${gate.comparator} ${gate.threshold}${failing}`).toBe(
        true,
      );
    });
  }
}

describe("seed gates (TC-065)", () => gateTests("seed"));
describe("held-out gates (TC-066)", () => gateTests("heldout"));
describe("held-out v2 gates (TASK-31)", () => gateTests("heldout-v2"));

describe("run budget (TC-069)", () => {
  test("finishes within 30 s", () => {
    expect(report.durationMs).toBeLessThanOrEqual(30_000);
  });
  test("makes no network call", () => {
    expect(report.networkCalls).toBe(0);
  });
});
