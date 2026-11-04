#!/usr/bin/env tsx
// Guard (TASK-46.5 · TC-109–TC-111 · N1): fail if any heritage desk asset is
// over 60 KB, any strip asset is over 25 KB, or any of the 8 expected files is
// missing (so an empty directory can't pass). Reads the path-B asset directory
// chosen by the TKT-46.02 verdict (EXE55): public/heritage/*.v1.{avif,webp}.
// Run: `pnpm image-budget [dir]` (dir defaults to public/heritage; wired into
// `test:all` right after `route-budget`).
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

/** Matches desk/strip assets, including size variants like `desk@2x` and `desk-2x`. */
const KIND = /^heritage-[a-z]+-(desk|strip)\b/i;

function limitFor(name: string): { kind: string; limit: number } | null {
  const kind = KIND.exec(name)?.[1]?.toLowerCase();
  if (!kind) return null;
  return { kind, limit: kind === "desk" ? DESK_BUDGET : STRIP_BUDGET };
}

const errCode = (err: unknown) => (err as NodeJS.ErrnoException)?.code ?? String(err);

/**
 * Lists the files in `dir` with their sizes. An absent directory is empty (so
 * every expected file is reported missing). Any other read failure, on the
 * directory or on one entry, throws "cannot read <path>: <code>".
 */
export function listAssets(dir: string): AssetFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    if (errCode(err) === "ENOENT") return [];
    throw new Error(`cannot read ${dir}: ${errCode(err)}`);
  }
  const files: AssetFile[] = [];
  for (const name of names) {
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch (err) {
      throw new Error(`cannot read ${path}: ${errCode(err)}`);
    }
    if (st.isFile()) files.push({ name, bytes: st.size });
  }
  return files;
}

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
    const budget = limitFor(f.name);
    if (!budget) continue;
    const { kind, limit } = budget;
    if (f.bytes > limit) {
      errors.push(
        `${f.name} is ${f.bytes} bytes (${(f.bytes / 1024).toFixed(1)} KB), over the ${limit / 1024} KB ${kind} budget`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

function main(): void {
  const dirArg = process.argv[2] ?? ASSET_DIR;
  let files: AssetFile[];
  try {
    // Relative paths resolve against the cwd; messages show the path as given.
    files = listAssets(dirArg);
  } catch (err) {
    console.error(`image-budget: ${(err as Error).message}`);
    process.exit(1);
  }

  for (const f of files.sort((a, b) => a.name.localeCompare(b.name))) {
    const budget = limitFor(f.name);
    if (!budget) continue;
    const kb = (f.bytes / 1024).toFixed(1);
    console.log(`${f.bytes > budget.limit ? "OVER" : "ok  "}  ${kb.padStart(6)} KB / ${budget.limit / 1024} KB  ${f.name}`);
  }

  const res = checkBudget(files, EXPECTED);
  if (!res.ok) {
    for (const e of res.errors) console.error(`image-budget: ${e}`);
    console.error(`image-budget: ${res.errors.length} problem(s) in ${dirArg}`);
    process.exit(1);
  }
  console.log(
    `image-budget: all ${EXPECTED.length} expected files present; desk ≤ ${DESK_BUDGET / 1024} KB, strip ≤ ${STRIP_BUDGET / 1024} KB`,
  );
}

if (process.argv[1] && /image-budget\.ts$/.test(process.argv[1])) main();
