import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets parallel worktrees run e2e without reusing each other's server.
const port = process.env.E2E_PORT ?? "3100";

export default defineConfig({
  testDir: "tests/e2e",
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
