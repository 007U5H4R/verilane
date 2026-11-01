/** Two runs give the same report apart from the volatile keys (TASK-21.4, TC-067). */
import { expect, test } from "vitest";
import { runEval, toJson, toMarkdown, VOLATILE_KEYS, type Report } from "./run";

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

// T28 defect 4: the committed report must not churn on every run. Two runs
// write byte-identical report.json and report.md (timing lives in the console).
test("two runs write identical report.json and report.md", async () => {
  const a = await runEval();
  const b = await runEval({ clock: () => new Date(Date.now() + 60_000) });
  expect(toJson(b)).toBe(toJson(a));
  expect(toMarkdown(b)).toBe(toMarkdown(a));
});
