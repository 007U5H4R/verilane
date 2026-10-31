#!/usr/bin/env tsx
// Guard (TASK-6.8): fail the build if an Anthropic API key or the string
// "ANTHROPIC" ever leaks into the client bundle under .next/static — those
// files ship to every visitor's browser, so a secret there is a breach.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), ".next/static");
const SECRET_PATTERN = /ANTHROPIC|sk-ant-/;

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function main(): void {
  let staticExists = true;
  try {
    statSync(STATIC_DIR);
  } catch {
    staticExists = false;
  }
  if (!staticExists) {
    console.error(
      `check-bundle-secrets: ${STATIC_DIR} not found — run "pnpm build" first.`,
    );
    process.exit(1);
  }

  const hits: string[] = [];
  for (const file of walk(STATIC_DIR)) {
    const contents = readFileSync(file, "utf-8");
    if (SECRET_PATTERN.test(contents)) {
      hits.push(file);
    }
  }

  if (hits.length > 0) {
    console.error("check-bundle-secrets: found secret-shaped strings in:");
    for (const file of hits) {
      console.error(`  - ${file}`);
    }
    process.exit(1);
  }

  console.log(`check-bundle-secrets: clean (${STATIC_DIR})`);
}

main();
