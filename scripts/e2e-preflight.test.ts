/**
 * Regression guard: a plain `pnpm build` left in `.next`, or a reused server
 * from another worktree, made every e2e spec time out on
 * `waitForFunction(() => window.__verilane !== undefined)` with no hint why.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { e2ePreflight } from "./e2e-preflight";

const SCRATCH = "/Volumes/E Drive/Dev/.scratch/verilane";
const BASE = "http://127.0.0.1:3199";
let root: string;

function build(id: string, chunk: string): void {
  mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
  writeFileSync(join(root, ".next/BUILD_ID"), id);
  writeFileSync(join(root, ".next/static/chunks/a.js"), chunk);
}

/** A server that serves only `servedId`'s build manifest. */
function server(servedId: string) {
  return async (url: string) => ({ status: url === `${BASE}/_next/static/${servedId}/_buildManifest.js` ? 200 : 404 });
}

beforeEach(() => {
  let base = tmpdir();
  try {
    mkdirSync(SCRATCH, { recursive: true });
    base = SCRATCH;
  } catch {
    // not on the dev machine — use the OS temp dir
  }
  root = mkdtempSync(join(base, "e2e-preflight-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("e2ePreflight", () => {
  it("passes on an e2e build served by this checkout", async () => {
    build("B1", "window.__verilane={}");
    expect(await e2ePreflight({ root, baseURL: BASE, fetchImpl: server("B1") })).toEqual([]);
  });

  it("fails when .next is a plain build without the e2e hooks", async () => {
    build("B1", "console.log(1)");
    const problems = await e2ePreflight({ root, baseURL: BASE, fetchImpl: server("B1") });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("pnpm build:e2e");
  });

  it("allows a plain build when E2E_ALLOW_PLAIN_BUILD is set", async () => {
    build("B1", "console.log(1)");
    expect(await e2ePreflight({ root, baseURL: BASE, allowPlainBuild: true, fetchImpl: server("B1") })).toEqual([]);
  });

  it("fails when the reused server serves a different build", async () => {
    build("B1", "window.__verilane={}");
    const problems = await e2ePreflight({ root, baseURL: BASE, fetchImpl: server("OTHER") });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not serving this checkout's build");
  });

  it("fails when the server is unreachable", async () => {
    build("B1", "window.__verilane={}");
    const down = async (): Promise<{ status: number }> => {
      throw new Error("ECONNREFUSED");
    };
    const problems = await e2ePreflight({ root, baseURL: BASE, fetchImpl: down });
    expect(problems[0]).toContain("ECONNREFUSED");
  });

  it("fails when there is no build at all", async () => {
    const problems = await e2ePreflight({ root, baseURL: BASE, fetchImpl: server("B1") });
    expect(problems).toEqual([expect.stringContaining("no production build")]);
  });
});
