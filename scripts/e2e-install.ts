/**
 * `pnpm e2e:install`: installs Chromium where `pnpm e2e` will look for it
 * (TASK-32 · T32-1). `playwright install` never reads playwright.config.ts, so
 * this loads the config first for its path defaults (PLAYWRIGHT_BROWSERS_PATH
 * if set, else node_modules/.cache/playwright/browsers), then runs the CLI.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import "../playwright.config";

const cli = createRequire(__filename).resolve("@playwright/test/cli");
console.info(`Installing Chromium into ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);
const result = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
