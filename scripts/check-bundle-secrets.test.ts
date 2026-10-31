/**
 * TASK-23 fix round 1 (T23-8): the bundle-secrets guard must not pass
 * vacuously. An empty `.next/static` means nothing was scanned, so it fails;
 * a clean run reports how many files it scanned.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "check-bundle-secrets.ts");
const TSX = join(__dirname, "..", "node_modules", ".bin", "tsx");
// Fixture dirs live on the E Drive scratch area when present (machine rule),
// falling back to the OS temp dir elsewhere (e.g. CI).
const SCRATCH = "/Volumes/E Drive/Dev/.scratch/verilane";

let root: string;

function runIn(cwd: string): { status: number | null; output: string } {
  const res = spawnSync(TSX, [SCRIPT], { cwd, encoding: "utf8", timeout: 60_000 });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

beforeEach(() => {
  let base = tmpdir();
  try {
    mkdirSync(SCRATCH, { recursive: true });
    base = SCRATCH;
  } catch {
    // not on the dev machine — use the OS temp dir
  }
  root = mkdtempSync(join(base, "check-secrets-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("check-bundle-secrets (T23-8)", () => {
  it("fails when .next/static exists but is empty", () => {
    mkdirSync(join(root, ".next/static"), { recursive: true });
    const { status, output } = runIn(root);
    expect(status).toBe(1);
    expect(output).toContain("0 files");
  }, 60_000);

  it("passes a clean bundle and reports the scanned file count", () => {
    mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
    writeFileSync(join(root, ".next/static/chunks/a.js"), "console.log('hi');");
    writeFileSync(join(root, ".next/static/b.css"), "body{}");
    const { status, output } = runIn(root);
    expect(output).toContain("scanned 2 files");
    expect(status).toBe(0);
  }, 60_000);

  it("fails when a file contains a secret-shaped string", () => {
    mkdirSync(join(root, ".next/static"), { recursive: true });
    writeFileSync(join(root, ".next/static/a.js"), "const k = 'sk-ant-test-not-a-key';");
    const { status } = runIn(root);
    expect(status).toBe(1);
  }, 60_000);
});
