#!/usr/bin/env tsx
// Guard (TASK-45.7 · TP-45.g · TC-160–TC-162): the splash's own weight.
// Run after `pnpm build`: `pnpm splash-budget` (wired into `test:all` after
// route-budget, which is unchanged). It measures source, deterministically:
//   1. gzip-9 of the inline head script + splash.css + splashMarkup() together ≤ 15 KB;
//   2. rasters in src/assets/splash/ (recursive): each sky file ≤ 60 KB, clouds ≤ 30 KB
//      per format; every url() in splash.css must name a file in that folder (EXE89);
//   3. each route's First Load JS (route-budget's own measure) grows ≤ 512 B over E1;
//   4. no splash runtime/markup marker in .next/static/chunks/*.js (the runtime
//      lives in server HTML; only the events.ts dispatch may reach shared JS).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, posix, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { splashMarkup } from "../src/lib/splash/markup";
import { SPLASH_COPY, buildSplashScript, splashConfig } from "../src/lib/splash/runtime";
import { measureRoutes, type RouteStat } from "./route-budget";

export const BUDGETS = {
  inlineTotal: 15 * 1024,
  routeDelta: 512,
  sky: 60 * 1024,
  clouds: 30 * 1024,
} as const;

/**
 * First Load JS gzip bytes per route at E1 (d7144cb, technical plan A8),
 * measured with route-budget's `measureRoutes` on a clean `pnpm build` of that
 * commit (EXE85). Regenerate only when a ticket deliberately moves the baseline.
 */
export const E1_ROUTE_GZIP: Readonly<Record<string, number>> = {
  "/settings": 301778,
  "/disputes/[id]": 292272,
  "/invoices/[id]": 291391,
  "/payments": 288604,
  "/audit": 287470,
  "/disputes": 286515,
  "/queue": 285333,
  "/invoices": 282587,
  "/sign-in": 281155,
  "/sign-up": 281155,
  "/emails": 281119,
  "/onboarding": 280473,
  "/welcome": 280194,
  "/": 279884,
  "/drafts": 277888,
  "/e2e-harness": 276387,
  "/_not-found": 273640,
  "/settings/eval": 273640,
};

export interface Finding {
  item: string;
  bytes: number;
  limit: number;
  over: boolean;
}

const finding = (item: string, bytes: number, limit: number): Finding => ({ item, bytes, limit, over: bytes > limit });

/** One gzip-9 over the parts concatenated, as they ship together in each document. */
export function checkInline(parts: { name: string; content: string | Buffer }[], limit: number = BUDGETS.inlineTotal): Finding {
  const buf = Buffer.concat(parts.map((p) => (typeof p.content === "string" ? Buffer.from(p.content) : p.content)));
  return finding("inline script+css+markup", gzipSync(buf, { level: 9 }).length, limit);
}

const RASTER = new Set([".avif", ".webp", ".png", ".jpg", ".jpeg", ".gif"]);

/** Raw file bytes (images go over the wire uncompressed). Sky per file; clouds summed per format. */
export function checkRasters(files: { name: string; bytes: number }[]): Finding[] {
  const out: Finding[] = [];
  const clouds = new Map<string, number>();
  for (const f of files) {
    const ext = extname(f.name).toLowerCase();
    if (!RASTER.has(ext)) continue;
    if (/sky/i.test(f.name)) out.push(finding(`raster ${f.name}`, f.bytes, BUDGETS.sky));
    else if (/cloud/i.test(f.name)) clouds.set(ext, (clouds.get(ext) ?? 0) + f.bytes);
    else out.push({ item: `raster ${f.name} (not sky or clouds)`, bytes: f.bytes, limit: 0, over: true });
  }
  for (const [ext, bytes] of clouds) out.push(finding(`rasters clouds (${ext})`, bytes, BUDGETS.clouds));
  return out;
}

/**
 * Every raster under `dir`, recursively, named by its path relative to `dir`.
 * A missing folder is "no rasters" (checkRasterRefs then fails any url() that
 * expected one); any other read error is rethrown so the gate cannot pass blind.
 */
export function listRasterFiles(dir: string, list: (d: string) => string[] = walk): { name: string; bytes: number }[] {
  let paths: string[];
  try {
    paths = list(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return paths.map((p) => ({ name: relative(dir, p).split(sep).join("/"), bytes: statSync(p).size }));
}

const SPLASH_ASSETS = "src/assets/splash/";

/**
 * Each url() in splash.css (which lives in src/app/) must resolve to a file in
 * src/assets/splash/, so every raster the splash can request is one the budget
 * measured. `files` are paths relative to that folder. data: URIs (counted in the
 * inline gzip) and #fragment refs are not requests and are skipped (EXE89).
 */
export function checkRasterRefs(css: string, files: string[]): Finding[] {
  const have = new Set(files);
  const out: Finding[] = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
    const ref = (m[2] ?? "").trim();
    if (ref === "" || ref.startsWith("data:") || ref.startsWith("#")) continue;
    const item = `splash.css url(${ref})`;
    const path = ref.replace(/[?#].*$/, "");
    const resolved = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(path) || path.startsWith("/") ? null : posix.join("src/app", path);
    if (resolved === null || !resolved.startsWith(SPLASH_ASSETS)) {
      out.push({ item: `${item}: outside ${SPLASH_ASSETS}`, bytes: 0, limit: 0, over: true });
    } else if (!have.has(resolved.slice(SPLASH_ASSETS.length))) {
      out.push({ item: `${item}: no such file in ${SPLASH_ASSETS}`, bytes: 0, limit: 0, over: true });
    } else {
      out.push({ item, bytes: 0, limit: 0, over: false });
    }
  }
  return out;
}

/** Growth of each route's First Load JS over E1. A route with no baseline fails until E1 is re-recorded. */
export function checkRouteDeltas(
  current: { route: string; gzipBytes: number }[],
  baseline: Readonly<Record<string, number>> = E1_ROUTE_GZIP,
  limit: number = BUDGETS.routeDelta,
): Finding[] {
  return current.map((r) => {
    const base = baseline[r.route];
    if (base === undefined) return { item: `route ${r.route} (no E1 baseline)`, bytes: r.gzipBytes, limit: 0, over: true };
    return finding(`route ${r.route} shared-JS delta vs E1`, r.gzipBytes - base, limit);
  });
}

/** Runtime-body literals events.ts does not carry (events.ts has only "verilane:splash" and "splash:ready"). */
const RUNTIME_LITERALS = ["splash:painted", "splash:skip", "splash:ceiling", "[verilane] splash ceiling reached before the app was ready"];

/**
 * Strings only the runtime, its config, its copy or its markup carry; the events.ts
 * dispatch ("verilane:splash", "splash:ready") is allowed. SPLASH_COPY.cont
 * ("Continue") is left out: app UI ships that word in shared chunks (EXE89).
 */
export function splashMarkers(): string[] {
  const cfg = splashConfig(false);
  const copy = [SPLASH_COPY.opening, SPLASH_COPY.ready, SPLASH_COPY.error, SPLASH_COPY.skip];
  const attrs = splashMarkup().match(/data-splash-[a-z-]+/g) ?? [];
  return [...new Set([cfg.seenKey, cfg.forceKey, ...RUNTIME_LITERALS, ...copy, ...attrs])];
}

/** Every marker hit is a failure; bytes are the marker's length (the minimum it costs). */
export function scanChunks(chunks: { path: string; text: string }[], markers: string[]): Finding[] {
  const hits: Finding[] = [];
  for (const c of chunks) {
    for (const m of markers) {
      if (c.text.includes(m)) hits.push({ item: `splash marker "${m}" in ${c.path}`, bytes: Buffer.byteLength(m), limit: 0, over: true });
    }
  }
  return hits.length > 0 ? hits : [{ item: "splash markers in shared JS", bytes: 0, limit: 0, over: false }];
}

export function report(findings: Finding[]): { code: 0 | 1; lines: string[] } {
  const lines = findings.map((f) => `${f.over ? "OVER" : "ok  "}  ${String(f.bytes).padStart(7)} B / ${String(f.limit).padStart(6)} B  ${f.item}`);
  const over = findings.filter((f) => f.over);
  if (over.length > 0) {
    lines.push(`splash-budget: ${over.length} item(s) over budget: ${over.map((f) => `${f.item} (${f.bytes} B)`).join("; ")}`);
    return { code: 1, lines };
  }
  lines.push(`splash-budget: all ${findings.length} checks within budget`);
  return { code: 0, lines };
}

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
  const root = process.cwd();
  const statsPath = join(root, ".next/diagnostics/route-bundle-stats.json");
  let stats: RouteStat[];
  try {
    stats = JSON.parse(readFileSync(statsPath, "utf-8")) as RouteStat[];
  } catch {
    console.error(`splash-budget: ${statsPath} not found — run "pnpm build" first.`);
    process.exit(1);
  }
  if (stats.length === 0) {
    console.error('splash-budget: route-bundle-stats.json lists 0 routes — run "pnpm build" first.');
    process.exit(1);
  }

  const findings: Finding[] = [];

  const script = buildSplashScript(splashConfig(false));
  const css = readFileSync(join(root, "src/app/splash.css"));
  const markup = splashMarkup();
  const gz = (b: string | Buffer) => gzipSync(b, { level: 9 }).length;
  // Informational split (tickets TKT-45.07 sub-targets); only the total gates (TP-45.g, EXE86).
  console.log(`info  script ${gz(script)} B · css ${gz(css)} B · markup ${gz(markup)} B (gzip-9 each)`);
  findings.push(checkInline([{ name: "script", content: script }, { name: "css", content: css }, { name: "markup", content: markup }]));

  const rasterDir = join(root, SPLASH_ASSETS);
  let rasters: { name: string; bytes: number }[];
  try {
    rasters = listRasterFiles(rasterDir);
  } catch (err) {
    console.error(`splash-budget: cannot read ${rasterDir}: ${(err as Error).message}`);
    process.exit(1);
  }
  const refs = checkRasterRefs(css.toString("utf-8"), rasters.map((r) => r.name));
  console.log(`info  ${rasters.length} file(s) under ${SPLASH_ASSETS} · ${refs.length} url() ref(s) in splash.css`);
  findings.push(...checkRasters(rasters), ...refs);

  findings.push(...checkRouteDeltas(measureRoutes(stats, (p) => readFileSync(join(root, p)))));

  const chunkDir = join(root, ".next/static/chunks");
  const chunks = walk(chunkDir)
    .filter((p) => p.endsWith(".js"))
    .map((p) => ({ path: p.slice(root.length + 1), text: readFileSync(p, "utf-8") }));
  if (chunks.length === 0) {
    console.error(`splash-budget: no .js chunks under ${chunkDir} — run "pnpm build" first.`);
    process.exit(1);
  }
  console.log(`info  scanned ${chunks.length} JS chunks for ${splashMarkers().join(", ")}`);
  findings.push(...scanChunks(chunks, splashMarkers()));

  const { code, lines } = report(findings);
  for (const l of lines) (code === 0 ? console.log : console.error)(l);
  process.exit(code);
}

if (process.argv[1] && /splash-budget\.ts$/.test(process.argv[1])) main();
