/**
 * TASK-32 (T28 defect 5): the unit and eval projects carry explicit, finite
 * timeouts. The vitest defaults (5 s test, 10 s hook) timed out on a loaded
 * machine before the gates reported. The reasons for each number live in
 * vitest.config.ts.
 */
import { describe, expect, it } from "vitest";
import config from "../vitest.config";

type ProjectTest = { name?: string; testTimeout?: number; hookTimeout?: number };

function project(name: string): ProjectTest {
  const projects = (config.test?.projects ?? []) as { test?: ProjectTest }[];
  const found = projects.find((p) => p.test?.name === name)?.test;
  if (!found) throw new Error(`no vitest project named ${name}`);
  return found;
}

const finite = (v: number | undefined): number => {
  expect(v).toBeDefined();
  expect(Number.isFinite(v)).toBe(true);
  return v!;
};

describe("vitest timeouts", () => {
  it("unit: test and hook timeouts are raised above the defaults and finite", () => {
    const unit = project("unit");
    expect(finite(unit.testTimeout)).toBeGreaterThanOrEqual(30_000);
    expect(finite(unit.hookTimeout)).toBeGreaterThanOrEqual(30_000);
  });

  it("eval: the hook timeout is at least twice the 30 s run budget (TC-069)", () => {
    const evalProject = project("eval");
    expect(finite(evalProject.hookTimeout)).toBeGreaterThanOrEqual(60_000);
    expect(finite(evalProject.testTimeout)).toBeGreaterThanOrEqual(30_000);
  });
});
