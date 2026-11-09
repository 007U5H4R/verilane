/**
 * E2E preflight (run by tests/e2e/global-setup.ts, after Playwright's
 * webServer is up and before any test). It turns two silent runner failures
 * into one clear error instead of every spec timing out on
 * `waitForFunction(() => window.__verilane !== undefined)`:
 *
 * 1. `.next` was built with a plain `pnpm build` (e.g. by the release gates'
 *    check:e2e-hooks step). NEXT_PUBLIC_E2E is inlined at BUILD time, so
 *    `next start` with NEXT_PUBLIC_E2E=1 cannot add the hooks back.
 * 2. `reuseExistingServer: true` attached to a server that is not serving this
 *    checkout's build (a stale `next start` from another worktree or an older
 *    build on the same port).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A name only an e2e build ships (see scripts/check-e2e-hooks.ts). */
const E2E_MARKER = "__verilane";

export interface PreflightOptions {
  /** Repo root that holds `.next`. */
  root: string;
  /** The server Playwright will test, e.g. http://127.0.0.1:3100. */
  baseURL: string;
  /** Skip the hook check, for specs that also run on a plain build (trust-walk). */
  allowPlainBuild?: boolean;
  fetchImpl?: (url: string) => Promise<{ status: number }>;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

/** Returns the problems found; an empty list means the run can go ahead. */
export async function e2ePreflight(opts: PreflightOptions): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? ((url: string) => fetch(url));
  let buildId: string;
  try {
    buildId = readFileSync(join(opts.root, ".next/BUILD_ID"), "utf8").trim();
  } catch {
    return [`no production build at ${opts.root}/.next — run "pnpm build:e2e" first.`];
  }

  const problems: string[] = [];
  if (!opts.allowPlainBuild) {
    let hasHooks = false;
    try {
      hasHooks = walk(join(opts.root, ".next/static")).some((f) => readFileSync(f, "utf8").includes(E2E_MARKER));
    } catch {
      /* unreadable static dir counts as no hooks */
    }
    if (!hasHooks) {
      problems.push(
        `.next (BUILD_ID ${buildId}) was built WITHOUT NEXT_PUBLIC_E2E=1, so window.__verilane and the other ` +
          `e2e hooks are compiled out and every spec would time out. Run "pnpm build:e2e" (a plain "pnpm build", ` +
          `e.g. from the release gates, overwrites it). Set E2E_ALLOW_PLAIN_BUILD=1 only for specs that run on a plain build.`,
      );
    }
  }

  const manifest = `${opts.baseURL}/_next/static/${buildId}/_buildManifest.js`;
  let status: number | string;
  try {
    status = (await fetchImpl(manifest)).status;
  } catch (err) {
    status = err instanceof Error ? err.message : String(err);
  }
  if (status !== 200) {
    problems.push(
      `the server at ${opts.baseURL} is not serving this checkout's build (GET ${manifest} → ${status}). ` +
        `reuseExistingServer probably attached to a stale "next start" from another worktree or an older build: ` +
        `stop it (lsof -nP -iTCP:<port> -sTCP:LISTEN) or pick a free E2E_PORT.`,
    );
  }
  return problems;
}
