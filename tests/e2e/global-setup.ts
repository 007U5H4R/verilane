import { join } from "node:path";

import type { FullConfig } from "@playwright/test";

import { e2ePreflight } from "../../scripts/e2e-preflight";

// Fails the whole run up front when the build or the reused server is wrong,
// instead of letting every spec time out waiting for window.__verilane.
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("e2e preflight: no baseURL in playwright.config.ts");
  const problems = await e2ePreflight({
    root: join(__dirname, "..", ".."),
    baseURL,
    allowPlainBuild: process.env.E2E_ALLOW_PLAIN_BUILD === "1",
  });
  if (problems.length > 0) {
    throw new Error(`e2e preflight failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
}
