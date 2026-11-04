/** TASK-45.7 · TC-160: the splash budget measures each part and fails naming the item and its bytes. */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  BUDGETS,
  E1_ROUTE_GZIP,
  checkInline,
  checkRasters,
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

  it("derives its markers from the runtime config and markup", () => {
    const m = splashMarkers();
    expect(m).toContain("verilane-splash-seen");
    expect(m).toContain("verilane-splash-force");
    expect(m).toContain("data-splash-skip");
    expect(m).not.toContain("verilane:splash");
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
    expect(r.lines.join("\n")).toMatch(/OVER .*raster sky\.webp.*62464 B/);
    expect(r.lines.at(-1)).toMatch(/1 item\(s\) over budget/);
  });
});
