/** TASK-45.7 · TC-160: the splash budget measures each part and fails naming the item and its bytes. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  BUDGETS,
  E1_ROUTE_GZIP,
  checkInline,
  checkRasterRefs,
  checkRasters,
  listRasterFiles,
  checkRouteDeltas,
  report,
  scanChunks,
  splashMarkers,
} from "./splash-budget";

const noisy = (n: number) => Buffer.from(Array.from({ length: n }, (_, i) => String((i * 7919) % 10007)).join(","));
const gz = (b: Buffer) => gzipSync(b, { level: 9 }).length;

describe("checkInline", () => {
  it("gzips script + CSS + markup together and passes under the limit", () => {
    const parts = [
      { name: "script", content: "a".repeat(100) },
      { name: "css", content: Buffer.from("b".repeat(100)) },
      { name: "markup", content: "<div></div>" },
    ];
    const f = checkInline(parts);
    const total = gz(Buffer.concat([Buffer.from("a".repeat(100)), Buffer.from("b".repeat(100)), Buffer.from("<div></div>")]));
    expect(f).toEqual({ item: "inline script+css+markup", bytes: total, limit: BUDGETS.inlineTotal, over: false });
  });

  it("flags the total when it is over the limit", () => {
    const content = noisy(2000);
    const f = checkInline([{ name: "script", content }], 100);
    expect(f.over).toBe(true);
    expect(f.bytes).toBe(gz(content));
  });
});

describe("checkRasters", () => {
  it("passes no rasters (the art is not in yet)", () => {
    expect(checkRasters([])).toEqual([]);
  });

  it("caps each sky file at 60 KB and the clouds at 30 KB per format", () => {
    const res = checkRasters([
      { name: "sky.avif", bytes: 40_000 },
      { name: "sky.webp", bytes: 61 * 1024 },
      { name: "clouds-back.avif", bytes: 10_000 },
      { name: "clouds-front.avif", bytes: 12_000 },
      { name: "clouds-back.webp", bytes: 20_000 },
      { name: "clouds-front.webp", bytes: 12_000 },
    ]);
    expect(res).toEqual([
      { item: "raster sky.avif", bytes: 40_000, limit: 60 * 1024, over: false },
      { item: "raster sky.webp", bytes: 61 * 1024, limit: 60 * 1024, over: true },
      { item: "rasters clouds (.avif)", bytes: 22_000, limit: 30 * 1024, over: false },
      { item: "rasters clouds (.webp)", bytes: 32_000, limit: 30 * 1024, over: true },
    ]);
  });

  it("fails a raster it cannot classify as sky or clouds", () => {
    expect(checkRasters([{ name: "lighthouse.png", bytes: 10 }])).toEqual([
      { item: "raster lighthouse.png (not sky or clouds)", bytes: 10, limit: 0, over: true },
    ]);
  });

  it("ignores non-raster files", () => {
    expect(checkRasters([{ name: "README.md", bytes: 999_999 }])).toEqual([]);
  });
});

describe("checkRasters extensions", () => {
  it("classifies an uppercase extension (sky.AVIF) against the sky cap (R-9)", () => {
    expect(checkRasters([{ name: "sky.AVIF", bytes: BUDGETS.sky + 1 }])).toEqual([
      { item: "raster sky.AVIF", bytes: BUDGETS.sky + 1, limit: BUDGETS.sky, over: true },
    ]);
  });

  it("classifies a nested file by its path under the folder", () => {
    expect(checkRasters([{ name: "clouds/a.webp", bytes: 10 }, { name: "clouds/b.webp", bytes: 20 }])).toEqual([
      { item: "rasters clouds (.webp)", bytes: 30, limit: BUDGETS.clouds, over: false },
    ]);
  });
});

describe("listRasterFiles (R-1)", () => {
  it("walks subdirectories and returns paths relative to the folder with sizes", () => {
    const dir = mkdtempSync(join(tmpdir(), "splash-assets-"));
    try {
      mkdirSync(join(dir, "clouds"));
      writeFileSync(join(dir, "sky.webp"), Buffer.alloc(7));
      writeFileSync(join(dir, "clouds", "a.avif"), Buffer.alloc(3));
      expect(listRasterFiles(dir).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: "clouds/a.avif", bytes: 3 },
        { name: "sky.webp", bytes: 7 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns [] when the folder does not exist (ENOENT)", () => {
    expect(listRasterFiles(join(tmpdir(), "splash-assets-does-not-exist-45-7"))).toEqual([]);
  });

  it("rethrows any other read error instead of passing silently", () => {
    const eacces = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    expect(() =>
      listRasterFiles("/x", () => {
        throw eacces;
      }),
    ).toThrow(/EACCES/);
  });
});

describe("checkRasterRefs (R-1)", () => {
  const files = ["sky.webp", "clouds/a.avif"];

  it("passes with no findings when splash.css has no url() and the folder is absent", () => {
    expect(checkRasterRefs(".splash{background:linear-gradient(#000,#fff)}", [])).toEqual([]);
  });

  it("fails a url() when the folder is missing or empty", () => {
    expect(checkRasterRefs('.s{background:url("../assets/splash/sky.webp")}', [])).toEqual([
      { item: 'splash.css url(../assets/splash/sky.webp): no such file in src/assets/splash/', bytes: 0, limit: 0, over: true },
    ]);
  });

  it("passes a url() that resolves to a file in the folder, nested included, quoted or not", () => {
    const css = ".a{background:url(../assets/splash/sky.webp)}.b{background:url('../assets/splash/clouds/a.avif?v=2')}";
    expect(checkRasterRefs(css, files)).toEqual([
      { item: "splash.css url(../assets/splash/sky.webp)", bytes: 0, limit: 0, over: false },
      { item: "splash.css url(../assets/splash/clouds/a.avif?v=2)", bytes: 0, limit: 0, over: false },
    ]);
  });

  it("fails a url() that resolves outside src/assets/splash/, including absolute and remote URLs", () => {
    const css = ".a{background:url(../../public/sky.webp)}.b{background:url(/sky.webp)}.c{background:url(https://cdn.example/sky.webp)}";
    expect(checkRasterRefs(css, files).map((f) => [f.item, f.over])).toEqual([
      ["splash.css url(../../public/sky.webp): outside src/assets/splash/", true],
      ["splash.css url(/sky.webp): outside src/assets/splash/", true],
      ["splash.css url(https://cdn.example/sky.webp): outside src/assets/splash/", true],
    ]);
  });

  it("ignores data: URIs and #fragment refs (they cost inline bytes, not requests)", () => {
    expect(checkRasterRefs(".a{background:url(data:image/png;base64,AAAA)}.b{filter:url(#blur)}", [])).toEqual([]);
  });
});

describe("checkRouteDeltas", () => {
  it("passes a growth of exactly 512 B and fails 513 B, naming the route", () => {
    const res = checkRouteDeltas(
      [
        { route: "/a", gzipBytes: 1000 + 512 },
        { route: "/b", gzipBytes: 2000 + 513 },
        { route: "/c", gzipBytes: 2900 },
      ],
      { "/a": 1000, "/b": 2000, "/c": 3000 },
    );
    expect(res).toEqual([
      { item: "route /a shared-JS delta vs E1", bytes: 512, limit: 512, over: false },
      { item: "route /b shared-JS delta vs E1", bytes: 513, limit: 512, over: true },
      { item: "route /c shared-JS delta vs E1", bytes: -100, limit: 512, over: false },
    ]);
  });

  it("fails a route with no E1 baseline", () => {
    expect(checkRouteDeltas([{ route: "/new", gzipBytes: 10 }], {})).toEqual([
      { item: "route /new (no E1 baseline)", bytes: 10, limit: 0, over: true },
    ]);
  });

  it("carries the E1 snapshot (d7144cb) for every measured route", () => {
    expect(Object.keys(E1_ROUTE_GZIP)).toHaveLength(18);
    expect(E1_ROUTE_GZIP["/settings"]).toBe(301778);
  });
});

describe("scanChunks", () => {
  const markers = ["verilane-splash-seen", "data-splash-skip"];

  it("passes chunks that only carry the events.ts dispatch", () => {
    const res = scanChunks(
      [{ path: "static/chunks/a.js", text: 'dispatchEvent(new CustomEvent("verilane:splash"));mark("splash:ready")' }],
      markers,
    );
    expect(res).toEqual([{ item: "splash markers in shared JS", bytes: 0, limit: 0, over: false }]);
  });

  it("fails naming each chunk and marker, with the marker's bytes", () => {
    const res = scanChunks(
      [
        { path: "static/chunks/a.js", text: "x" },
        { path: "static/chunks/b.js", text: 'sessionStorage.getItem("verilane-splash-seen")' },
      ],
      markers,
    );
    expect(res).toEqual([
      { item: 'splash marker "verilane-splash-seen" in static/chunks/b.js', bytes: 20, limit: 0, over: true },
    ]);
  });

  it("derives its markers from the runtime config, copy, runtime literals and markup (R-4, R-9)", () => {
    // "Continue" (SPLASH_COPY.cont) and the tagline are left out: app UI ships them in shared chunks (EXE89, TASK-45.5).
    expect(splashMarkers()).toEqual([
      "verilane-splash-seen",
      "verilane-splash-force",
      "splash:painted",
      "splash:skip",
      "splash:ceiling",
      "[verilane] splash ceiling reached before the app was ready",
      "Verilane. Opening workspace…",
      "Verilane. Preparing demo data…",
      "Verilane. Workspace ready",
      "Verilane. Workspace opened",
      "Skip intro",
      "Still working — first visits can take a few seconds.",
      "or press any key",
      "or tap anywhere",
      "data-splash-bar",
      "data-splash-status",
      "data-splash-msg",
      "data-splash-sub",
      "data-splash-skip",
    ]);
    expect(splashMarkers()).not.toContain("verilane:splash");
    expect(splashMarkers()).not.toContain("splash:ready");
    expect(splashMarkers()).not.toContain("AR Collections Copilot");
  });
});

describe("report", () => {
  it("exits 0 when everything is within budget", () => {
    const r = report([{ item: "inline script+css+markup", bytes: 10, limit: 20, over: false }]);
    expect(r.code).toBe(0);
    expect(r.lines.at(-1)).toMatch(/within budget/);
  });

  it("exits 1 and names the offending item and its bytes", () => {
    const r = report([
      { item: "inline script+css+markup", bytes: 10, limit: 20, over: false },
      { item: "raster sky.webp", bytes: 62464, limit: 61440, over: true },
    ]);
    expect(r.code).toBe(1);
    expect(r.lines.join("\n")).toMatch(/OVER +62464 B .*raster sky\.webp/);
    expect(r.lines.at(-1)).toMatch(/1 item\(s\) over budget: raster sky\.webp \(62464 B\)/);
  });
});
