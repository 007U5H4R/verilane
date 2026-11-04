/**
 * TASK-25 · TC-079: the e2e-only `?__state=` override must not ship in a
 * plain build. The guard fails on a hit, on an empty or missing
 * `.next/static`, and passes on a clean tree.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "check-e2e-hooks.ts");
const TSX = join(__dirname, "..", "node_modules", ".bin", "tsx");
const SCRATCH = "/Volumes/E Drive/Dev/.scratch/verilane";

let root: string;

function runIn(cwd: string): { status: number | null; output: string } {
  const res = spawnSync(TSX, [SCRIPT], { cwd, encoding: "utf8", timeout: 60_000 });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

function writeStatic(name: string, contents: string): void {
  const dir = join(root, ".next/static/chunks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), contents);
}

beforeEach(() => {
  let base = tmpdir();
  try {
    mkdirSync(SCRATCH, { recursive: true });
    base = SCRATCH;
  } catch {
    // not on the dev machine — use the OS temp dir
  }
  root = mkdtempSync(join(base, "check-e2e-hooks-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("check-e2e-hooks", () => {
  it("fails when .next/static is missing", () => {
    const { status, output } = runIn(root);
    expect(status).toBe(1);
    expect(output).toContain("not found");
  });

  it("fails when .next/static is empty", () => {
    mkdirSync(join(root, ".next/static"), { recursive: true });
    const { status, output } = runIn(root);
    expect(status).toBe(1);
    expect(output).toContain("0 files");
  });

  it("fails when a chunk still carries the __state override", () => {
    writeStatic("a.js", 'const s=p.get("__state");');
    writeStatic("b.js", "console.log(1)");
    const { status, output } = runIn(root);
    expect(status).toBe(1);
    expect(output).toContain("a.js");
    expect(output).not.toContain("b.js");
  });

  it("fails when a chunk still carries the window.__verilane hook", () => {
    writeStatic("c.js", "window.__verilane={execute:x};");
    const { status, output } = runIn(root);
    expect(status).toBe(1);
    expect(output).toContain("__verilane in");
  });

  it("fails when a chunk still carries the __session opt-out (TASK-39)", () => {
    writeStatic("d.js", 'if(q.get("__session")==="none")x();');
    const { status, output } = runIn(root);
    expect(status).toBe(1);
    expect(output).toContain("__session in");
  });

  it("fails when a chunk still carries the __splash force hook (TASK-45.2)", () => {
    writeStatic("e.js", 'if(q.get("__splash")==="1")x();');
    const { status, output } = runIn(root);
    expect(status).toBe(1);
    expect(output).toContain("__splash in");
  });

  it("passes on a clean tree and reports how many files it scanned", () => {
    writeStatic("a.js", "const s=null;");
    const { status, output } = runIn(root);
    expect(status).toBe(0);
    expect(output).toContain("absent from 1 files");
  });
});
