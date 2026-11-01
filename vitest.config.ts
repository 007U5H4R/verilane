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
        },
      },
    ],
  },
});
