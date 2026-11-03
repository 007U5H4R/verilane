#!/usr/bin/env tsx
// Guard (TASK-25 · TC-079, decisions.md): the `?__state=` screen-state
// override and the `window.__verilane` command hook exist only for the e2e
// build (NEXT_PUBLIC_E2E=1). A plain `pnpm build` must compile them away, so
// neither name may appear anywhere under .next/static. TASK-39 adds the
// `?__session=none` opt-out from the e2e default guest session.
// Run after `pnpm build` — never after `pnpm build:e2e`, where it is expected.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), ".next/static");
const HOOKS = ["__state", "__verilane", "__session"];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function main(): void {
  try {
    statSync(STATIC_DIR);
  } catch {
    console.error(`check-e2e-hooks: ${STATIC_DIR} not found — run "pnpm build" first.`);
    process.exit(1);
  }
  const files = walk(STATIC_DIR);
  if (files.length === 0) {
    console.error(`check-e2e-hooks: ${STATIC_DIR} has 0 files — run "pnpm build" first.`);
    process.exit(1);
  }
  const hits: string[] = [];
  for (const f of files) {
    const contents = readFileSync(f, "utf-8");
    for (const hook of HOOKS) if (contents.includes(hook)) hits.push(`${hook} in ${f}`);
  }
  if (hits.length > 0) {
    console.error("check-e2e-hooks: e2e-only hooks shipped in the production bundle:");
    for (const h of hits) console.error(`  - ${h}`);
    process.exit(1);
  }
  console.log(`check-e2e-hooks: clean — ${HOOKS.join(", ")} absent from ${files.length} files (${STATIC_DIR})`);
}

main();
