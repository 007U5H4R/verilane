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
