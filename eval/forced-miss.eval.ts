/**
 * A forced miss fails the run (TASK-21.4, TC-068). Spawns the gated eval as a
 * child with VERILANE_EVAL_FORCE_MISS=1, which corrupts one seed amount, and
 * checks the child exits non-zero and its report marks that gate failed.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { Report, VOLATILE_KEYS } from "./run";

/** report.json as written: the run minus its timestamp and duration (TASK-32). */
type WrittenReport = Omit<Report, (typeof VOLATILE_KEYS)[number]>;

const ROOT = process.cwd();

test("VERILANE_EVAL_FORCE_MISS=1 exits non-zero and marks the gate failed", () => {
  // node_modules/.cache: ignored by git, and on the same disk as the repo.
  const base = join(ROOT, "node_modules", ".cache", "verilane-eval");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "forced-miss-"));
  try {
    const child = spawnSync(
      join(ROOT, "node_modules", ".bin", "vitest"),
      ["run", "--project", "eval", "eval/gates.eval.ts"],
      {
        cwd: ROOT,
        encoding: "utf8",
        // More than the child's 60 s eval hookTimeout, so a slow child fails
        // on its own terms instead of being killed before it writes the report.
        timeout: 90_000,
        env: { ...process.env, VERILANE_EVAL_FORCE_MISS: "1", VERILANE_EVAL_REPORT_DIR: dir },
      },
    );
    // Exactly 1 (a gate missed), not null from a kill or a spawn error.
    expect(child.status, `signal=${child.signal} error=${child.error} ${child.stderr}`).toBe(1);

    const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as WrittenReport;
    expect(report.forcedMiss).toBe(true);
    expect(report.passed).toBe(false);
    const amount = report.gates.find((g) => g.set === "seed" && g.name === "Amount exact match");
    expect(amount?.passed).toBe(false);
    expect(amount?.failures.length).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);
