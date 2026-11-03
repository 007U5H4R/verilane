/**
 * TASK-59 (SEC-003 / CR-017): the Vercel build must refuse to ship the e2e
 * hooks or live-LLM mode. The guard reads only the process env, fails on any
 * forbidden variable, and never echoes a secret's value.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "check-deploy-env.ts");
const TSX = join(__dirname, "..", "node_modules", ".bin", "tsx");

function run(env: Record<string, string>): { status: number | null; output: string } {
  const base: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
  const res = spawnSync(TSX, [SCRIPT], { env: { ...base, ...env } as NodeJS.ProcessEnv, encoding: "utf8", timeout: 60_000 });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

describe("check-deploy-env", () => {
  it("passes on a clean env", () => {
    const { status, output } = run({ VERCEL_ENV: "production" });
    expect(status).toBe(0);
    expect(output).toContain("clean");
  });

  it("fails when NEXT_PUBLIC_E2E=1 would compile the e2e hooks in", () => {
    const { status, output } = run({ VERCEL_ENV: "production", NEXT_PUBLIC_E2E: "1" });
    expect(status).toBe(1);
    expect(output).toContain("NEXT_PUBLIC_E2E");
  });

  it("allows NEXT_PUBLIC_E2E=0 (the value next.config.ts inlines anyway)", () => {
    expect(run({ NEXT_PUBLIC_E2E: "0" }).status).toBe(0);
  });

  it("fails when VERILANE_LIVE_LLM is set", () => {
    const { status, output } = run({ VERILANE_LIVE_LLM: "1" });
    expect(status).toBe(1);
    expect(output).toContain("VERILANE_LIVE_LLM");
  });

  it("fails when ANTHROPIC_API_KEY is set, without printing its value", () => {
    const { status, output } = run({ ANTHROPIC_API_KEY: "sk-ant-test-DO-NOT-ECHO" });
    expect(status).toBe(1);
    expect(output).toContain("ANTHROPIC_API_KEY");
    expect(output).not.toContain("DO-NOT-ECHO");
  });

  it("treats an empty ANTHROPIC_API_KEY as unset", () => {
    expect(run({ ANTHROPIC_API_KEY: "" }).status).toBe(0);
  });

  it("reports every violation at once", () => {
    const { status, output } = run({ NEXT_PUBLIC_E2E: "1", VERILANE_LIVE_LLM: "1", ANTHROPIC_API_KEY: "x" });
    expect(status).toBe(1);
    for (const name of ["NEXT_PUBLIC_E2E", "VERILANE_LIVE_LLM", "ANTHROPIC_API_KEY"]) {
      expect(output).toContain(name);
    }
  });
});
