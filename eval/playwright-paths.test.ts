/**
 * TASK-32 (review T32-1): playwright.config.ts is where Playwright's browsers
 * and temp files get redirected. With nothing set, both resolve inside the
 * repo (node_modules/.cache/playwright, gitignored, on the repo's own disk),
 * never ~/Library/Caches or the OS temp dir. A browsers path the caller already
 * set is kept; E2E_TMPDIR picks the temp dir. Loads the config in a child so
 * the env it sees is exactly what a fresh `pnpm e2e` shell would have.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const CACHE = join(ROOT, "node_modules", ".cache", "playwright");

function loadConfig(env: Record<string, string | undefined>): { browsers?: string; tmp?: string } {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.PLAYWRIGHT_BROWSERS_PATH;
  delete childEnv.E2E_TMPDIR;
  childEnv.TMPDIR = tmpdir();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  const script =
    "import('./playwright.config.ts').then(() => console.log(JSON.stringify(" +
    "{ browsers: process.env.PLAYWRIGHT_BROWSERS_PATH, tmp: process.env.TMPDIR })))";
  const child = spawnSync(join(ROOT, "node_modules", ".bin", "tsx"), ["-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    env: childEnv,
  });
  expect(child.status, `${child.stderr}${child.error ?? ""}`).toBe(0);
  return JSON.parse(child.stdout.trim().split("\n").pop() ?? "{}");
}

describe("playwright.config.ts browser and temp paths", () => {
  it("with nothing set, browsers and temp files resolve inside the repo", () => {
    const { browsers, tmp } = loadConfig({});
    expect(browsers).toBe(join(CACHE, "browsers"));
    expect(tmp).toBe(join(CACHE, "tmp"));
    expect(existsSync(join(CACHE, "tmp"))).toBe(true);
  });

  it("keeps a preset PLAYWRIGHT_BROWSERS_PATH and honours E2E_TMPDIR", () => {
    const presetTmp = join(CACHE, "tmp-override-test");
    try {
      const { browsers, tmp } = loadConfig({
        PLAYWRIGHT_BROWSERS_PATH: "/preset/playwright-browsers",
        E2E_TMPDIR: presetTmp,
      });
      expect(browsers).toBe("/preset/playwright-browsers");
      expect(tmp).toBe(presetTmp);
    } finally {
      rmSync(presetTmp, { recursive: true, force: true });
    }
  });
});
