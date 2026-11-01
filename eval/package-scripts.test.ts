/**
 * TASK-32 (T28 defects 1-2): the e2e scripts run on any machine. Playwright
 * reads PLAYWRIGHT_BROWSERS_PATH and TMPDIR from the caller's environment, so
 * the script must not pin a machine-specific path. The full gate runs e2e on one
 * worker, the only mode the suite is proven green in (TASK-28 report).
 * Lives under eval/ because that is the unit-project folder this lane owns.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scripts = (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
}).scripts;

describe("package.json e2e scripts", () => {
  it("e2e pins no browser or temp path, so the env (or Playwright's default) decides", () => {
    const e2e = scripts.e2e ?? "";
    expect(e2e).toContain("playwright test");
    expect(e2e).not.toMatch(/PLAYWRIGHT_BROWSERS_PATH|TMPDIR|\/Volumes\//);
  });

  it("test:all runs e2e on one worker", () => {
    expect(scripts["test:all"]).toMatch(/pnpm e2e --workers=1$/);
  });
});
