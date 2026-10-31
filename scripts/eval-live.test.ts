/**
 * TASK-23 fix round 1 (T23-1): `pnpm eval:live` must get past its imports
 * (`@/server/llm` pulls in `server-only`, which throws outside the
 * `react-server` export condition) and reach its own guards. Runs the real
 * package.json script with the key and flag stripped from the env, so the
 * live-mode guard always stops it before any network call.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runEvalLive(args: string[]): { status: number | null; output: string } {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.VERILANE_LIVE_LLM;
  const res = spawnSync("pnpm", ["-s", "eval:live", ...args], { env, encoding: "utf8", timeout: 60_000 });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

describe("pnpm eval:live smoke (T23-1)", () => {
  it("without --yes, stops at the spend-confirmation guard", () => {
    const { status, output } = runEvalLive([]);
    expect(output).not.toContain("server-only");
    expect(output).toContain("Re-run with --yes");
    expect(status).toBe(1);
  }, 60_000);

  it("with --yes but no key/flag, stops at the live-mode guard", () => {
    const { status, output } = runEvalLive(["--yes"]);
    expect(output).not.toContain("server-only");
    expect(output).toContain("live mode is disabled");
    expect(status).toBe(1);
  }, 60_000);
});
