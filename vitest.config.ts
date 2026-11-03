import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "eval/**/*.test.ts"],
          setupFiles: ["src/test/setup.ts"],
          // TASK-32 (T28 defect 5): the slowest unit tests spawn tsx
          // (scripts/check-e2e-hooks.test.ts, ~0.5 s each idle) or cold-import
          // the Anthropic SDK (src/app/api/llm/route.test.ts, ~0.6 s for the
          // first test). Both blew the 5 s default under a parallel load. 30 s is
          // ~50x the idle cost and still finite. spawnSync blocks the event
          // loop, so this timer can't interrupt a spawn; a hung spawn is still
          // capped at 60 s by spawnSync's own timeout.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        // TC-084 wall-clock budget: its own project, one file at a time, run
        // as a separate step so parallel unit workers can't skew the timing.
        test: {
          name: "perf",
          environment: "node",
          include: ["src/**/*.perf.ts"],
          setupFiles: ["src/test/setup.ts"],
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "eval",
          environment: "node",
          include: ["eval/**/*.eval.ts"],
          testTimeout: 30000,
          // runEval() runs in beforeAll (~4 s idle) under a 30 s TC-069 budget.
          // The 10 s default hook timeout fired first under load, hiding the
          // gate results. 60 s is twice the budget, so a slow run reaches the
          // "finishes within 30 s" test and fails there with its real duration.
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
