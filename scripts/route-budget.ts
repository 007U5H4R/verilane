#!/usr/bin/env tsx
// Guard (TASK-25.5 · TC-083): fail if any route's First Load JS exceeds
// 300 KB gzip on the production build. Next 16's build output no longer
// prints a "First Load JS" column, so this reads the per-route chunk list
// Next writes to `.next/diagnostics/route-bundle-stats.json` and gzips each
// chunk itself. Run after `pnpm build`: `pnpm route-budget` (wired into `test:all`).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

export const BUDGET_BYTES = 300 * 1024;

export interface RouteStat {
  route: string;
  firstLoadChunkPaths: string[];
}

export interface RouteBudget {
  route: string;
  gzipBytes: number;
  chunks: number;
  over: boolean;
}

/** Sums each route's gzip-compressed first-load chunks. `readChunk` is injectable for tests. */
export function measureRoutes(
  stats: RouteStat[],
  readChunk: (path: string) => Buffer,
  budget = BUDGET_BYTES,
): RouteBudget[] {
  const cache = new Map<string, number>();
  const gz = (path: string) => {
    let n = cache.get(path);
    if (n === undefined) {
      n = gzipSync(readChunk(path), { level: 9 }).length;
      cache.set(path, n);
    }
    return n;
  };
  return stats.map((s) => {
    const gzipBytes = s.firstLoadChunkPaths.reduce((sum, p) => sum + gz(p), 0);
    return { route: s.route, gzipBytes, chunks: s.firstLoadChunkPaths.length, over: gzipBytes > budget };
  });
}

function main(): void {
  const root = process.cwd();
  const statsPath = join(root, ".next/diagnostics/route-bundle-stats.json");
  let stats: RouteStat[];
  try {
    stats = JSON.parse(readFileSync(statsPath, "utf-8")) as RouteStat[];
  } catch {
    console.error(`route-budget: ${statsPath} not found — run "pnpm build" first.`);
    process.exit(1);
  }
  if (stats.length === 0) {
    // Nothing measured is not "within budget".
    console.error("route-budget: route-bundle-stats.json lists 0 routes — run \"pnpm build\" first.");
    process.exit(1);
  }

  const results = measureRoutes(stats, (p) => readFileSync(join(root, p)));
  for (const r of results) {
    const kb = (r.gzipBytes / 1024).toFixed(1);
    console.log(`${r.over ? "OVER" : "ok  "}  ${kb.padStart(7)} KB gzip  ${String(r.chunks).padStart(3)} chunks  ${r.route}`);
  }

  const out = process.env.ROUTE_BUDGET_OUT;
  if (out) {
    mkdirSync(join(out, ".."), { recursive: true });
    writeFileSync(out, JSON.stringify({ budgetBytes: BUDGET_BYTES, routes: results }, null, 2));
  }

  const over = results.filter((r) => r.over);
  if (over.length > 0) {
    console.error(`route-budget: ${over.length} route(s) over ${BUDGET_BYTES / 1024} KB gzip First Load JS`);
    process.exit(1);
  }
  console.log(`route-budget: all ${results.length} routes ≤ ${BUDGET_BYTES / 1024} KB gzip First Load JS`);
}

if (process.argv[1] && /route-budget\.ts$/.test(process.argv[1])) main();
