/** Two runs give the same report apart from the volatile keys (TASK-21.4, TC-067). */
import { expect, test } from "vitest";
import { runEval, toJson, VOLATILE_KEYS, type Report } from "./run";

function stable(report: Report): string {
  const copy: Partial<Report> = { ...report };
  for (const k of VOLATILE_KEYS) delete copy[k];
  return toJson(copy as Report);
}

test("two runs are equal apart from generatedAt and durationMs", async () => {
  const a = await runEval();
  const b = await runEval();
  expect(stable(b)).toBe(stable(a));
});
