import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Browsers and temp files stay on the repo's own disk unless the caller picks
// a place (TASK-32 · T32-1). A PLAYWRIGHT_BROWSERS_PATH already set is kept;
// E2E_TMPDIR picks the temp dir (TMPDIR itself is always set by macOS, so it
// can't signal intent). Resolved from this file, not cwd. Workers are forked
// after this runs and inherit process.env, so their browser lookup and
// os.tmpdir() see these values. scripts/e2e-install.ts reuses this default.
const playwrightCache = join(__dirname, "node_modules", ".cache", "playwright");
process.env.PLAYWRIGHT_BROWSERS_PATH ||= join(playwrightCache, "browsers");
process.env.TMPDIR = process.env.E2E_TMPDIR || join(playwrightCache, "tmp");
mkdirSync(process.env.TMPDIR, { recursive: true });

// E2E_PORT lets parallel worktrees run e2e without reusing each other's server.
const port = process.env.E2E_PORT ?? "3100";

export default defineConfig({
  testDir: "tests/e2e",
  // TASK-45.2 (TP-45.h): the splash A/B is slow and noisy, so it runs only via
  // `pnpm e2e:splash-perf` (SPLASH_PERF=1), never in the default `pnpm e2e`.
  ...(process.env.SPLASH_PERF === "1" ? { grep: /@splash-perf/ } : { grepInvert: /@splash-perf/ }),
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // The PWA service worker would answer requests before page.route mocks
    // see them; only tests/e2e/pwa.spec.ts opts back in (TASK-24).
    serviceWorkers: "block",
  },
  webServer: {
    command: `pnpm start -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    env: { NEXT_PUBLIC_E2E: "1" },
  },
  projects: [
    {
      name: "chromium-light",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "chromium-dark",
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
  ],
});
