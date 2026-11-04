#!/usr/bin/env tsx
// Guard (TASK-46.5 · TC-109–TC-111 · N1): fail if any heritage desk asset is
// over 60 KB, any strip asset is over 25 KB, or any of the 8 expected files is
// missing (so an empty directory can't pass). Reads the path-B asset directory
// chosen by the TKT-46.02 verdict (EXE55): public/heritage/*.v1.{avif,webp}.
// Run: `pnpm image-budget` (wired into `test:all` right after `route-budget`).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const DESK_BUDGET = 60 * 1024;
export const STRIP_BUDGET = 25 * 1024;

/** Path-B filename version; bumped by hand on each art change (EXE55/EXE56). */
export const ASSET_VERSION = "v1";
export const ASSET_DIR = join("public", "heritage");

export const EXPECTED: readonly string[] = (["light", "dark"] as const).flatMap((theme) =>
  (["desk", "strip"] as const).flatMap((size) =>
    (["avif", "webp"] as const).map((ext) => `heritage-${theme}-${size}.${ASSET_VERSION}.${ext}`),
  ),
);

export interface AssetFile {
  name: string;
  bytes: number;
}

const KIND = /^heritage-[a-z]+-(desk|strip)\./;

export function checkBudget(
  files: AssetFile[],
  expected: readonly string[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const present = new Set(files.map((f) => f.name));
  for (const name of expected) {
    if (!present.has(name)) errors.push(`${name} is missing`);
  }
  for (const f of files) {
    const kind = KIND.exec(f.name)?.[1];
    if (!kind) continue;
    const limit = kind === "desk" ? DESK_BUDGET : STRIP_BUDGET;
    if (f.bytes > limit) {
      errors.push(
        `${f.name} is ${f.bytes} bytes (${(f.bytes / 1024).toFixed(1)} KB), over the ${limit / 1024} KB ${kind} budget`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

function main(): void {
  const dir = join(process.cwd(), ASSET_DIR);
  let files: AssetFile[];
  try {
    files = readdirSync(dir)
      .filter((name) => statSync(join(dir, name)).isFile())
      .map((name) => ({ name, bytes: statSync(join(dir, name)).size }));
  } catch {
    // An absent directory is reported as every expected file missing.
    files = [];
  }

  for (const f of files.filter((f) => KIND.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const limit = /-desk\./.test(f.name) ? DESK_BUDGET : STRIP_BUDGET;
    const kb = (f.bytes / 1024).toFixed(1);
    console.log(`${f.bytes > limit ? "OVER" : "ok  "}  ${kb.padStart(6)} KB / ${limit / 1024} KB  ${f.name}`);
  }

  const res = checkBudget(files, EXPECTED);
  if (!res.ok) {
    for (const e of res.errors) console.error(`image-budget: ${e}`);
    console.error(`image-budget: ${res.errors.length} problem(s) in ${ASSET_DIR}`);
    process.exit(1);
  }
  console.log(
    `image-budget: all ${EXPECTED.length} expected files present; desk ≤ ${DESK_BUDGET / 1024} KB, strip ≤ ${STRIP_BUDGET / 1024} KB`,
  );
}

if (process.argv[1] && /image-budget\.ts$/.test(process.argv[1])) main();
