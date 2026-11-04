import { readFile } from "node:fs/promises";
import path from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

import { contrastRatio, decodeRegion, hexToRgb, percentile, prominence, srgbToLstar, type Rgb } from "../../src/test/lstar";

// TASK-46.6: the heritage contrast (SC1, TC-113/TC-114) and prominence (SC2,
// TC-115) gates, plus the negative-fixture proof that SC1 actually catches a
// violation (TC-116). Runs once, under chromium-light only — both themes are
// forced via `verilane-theme` in localStorage (the app's own pre-hydration
// theme script honours a stored value over `prefers-color-scheme`), so the
// separate chromium-dark project would only repeat the same assertions.

type Theme = "light" | "dark";
type Level = "normal" | "reduced";

// PRD §4 (src/lib/heritage.ts): every shell route whose level isn't "off",
// plus the three concrete detail routes (the two `[id]` dynamic routes and
// /settings/eval) the PRD calls out as "detail routes" (EXE58). 12 routes.
const ROUTES: readonly { url: string; level: Level }[] = [
  { url: "/", level: "normal" },
  { url: "/queue", level: "normal" },
  { url: "/disputes", level: "normal" },
  { url: "/invoices", level: "normal" },
  { url: "/payments", level: "normal" },
  { url: "/emails", level: "reduced" },
  { url: "/settings", level: "reduced" },
  { url: "/drafts", level: "reduced" },
  { url: "/audit", level: "reduced" },
  { url: "/settings/eval", level: "reduced" },
  { url: "/invoices/INV-A", level: "reduced" },
  { url: "/disputes/D-E-011-1", level: "reduced" },
];

// PRD §6.2 prominence bands (both themes use the same P definition; only the
// percentile side — darkest for light, brightest for dark — differs).
const P_BAND: Record<Level, [number, number]> = {
  normal: [0.08, 0.15],
  reduced: [0.04, 0.08],
};

// PRD §6.2: in the text zone, light art must stay at L* ≥ 92.1 so
// --text-muted keeps AA (≥4.5:1). Dark has no such floor — "Dark is not
// constrained by AA inside the normal band. Its limit is purely aesthetic" —
// so dark gets only the general outside-zone P-band check below, applied
// without a zone carve-out.
const LIGHT_ZONE_FLOOR_LSTAR = 92.1;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Candidate extends Box {
  id: string;
  large: boolean;
  colorStr: string;
}

function parseCssColor(s: string): Rgb {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s);
  if (!m) throw new Error(`cannot parse computed color: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** `--canvas` / `--text` as rendered for the current theme (`:root[data-theme]`). */
async function themeTokens(page: Page): Promise<{ canvasL: number; textL: number }> {
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { canvas: cs.getPropertyValue("--canvas").trim(), text: cs.getPropertyValue("--text").trim() };
  });
  return { canvasL: srgbToLstar(...hexToRgb(tokens.canvas)), textL: srgbToLstar(...hexToRgb(tokens.text)) };
}

/**
 * The PRD §13 text zone: from the content column's left edge to 55% of its
 * width, from the top bar's bottom edge to 160px below it. `null` if either
 * landmark is missing (route has no heritage band — shouldn't happen for the
 * routes this spec tests, but fails loudly rather than silently if it does).
 */
async function textZone(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const heritage = document.querySelector("[data-heritage]");
    const column = heritage?.parentElement;
    const topbar = document.querySelector("header.topbar-wave");
    if (!column || !topbar) return null;
    const c = column.getBoundingClientRect();
    const t = topbar.getBoundingClientRect();
    return { x: c.left, y: t.bottom, width: c.width * 0.55, height: 160 };
  });
}

/** The heritage band's own rendered box. `null` if it isn't in the DOM (level "off"). */
async function bandBox(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-heritage]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

/**
 * Candidate text elements whose box intersects the zone: elements with a
 * direct (non-whitespace) text node, visible, inside the zone rectangle.
 * Tags each with a unique `data-contrast-id` so the caller can batch-inject
 * `color: transparent` and crop every box from one screenshot.
 */
async function textZoneCandidates(page: Page, zone: Box): Promise<Candidate[]> {
  return page.evaluate((zoneArg) => {
    const selector = "h1,h2,h3,h4,h5,p,span,a,button,label,td,th,li,dt,dd,strong,em";
    const out: { id: string; x: number; y: number; width: number; height: number; large: boolean; colorStr: string }[] = [];
    let i = 0;
    for (const el of document.querySelectorAll(selector)) {
      const hasDirectText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
      if (!hasDirectText) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const ix = Math.max(r.left, zoneArg.x);
      const iy = Math.max(r.top, zoneArg.y);
      const ax = Math.min(r.right, zoneArg.x + zoneArg.width);
      const ay = Math.min(r.bottom, zoneArg.y + zoneArg.height);
      if (ax <= ix || ay <= iy) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
      const id = `contrast-${i++}`;
      el.setAttribute("data-contrast-id", id);
      const fontSize = parseFloat(cs.fontSize);
      const fontWeight = parseInt(cs.fontWeight, 10) || 400;
      // WCAG "large text": ≥24px, or ≥18.67px at ≥700 weight.
      const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      out.push({ id, x: r.x, y: r.y, width: r.width, height: r.height, large, colorStr: cs.color });
    }
    return out;
  }, zone);
}

/**
 * The background luminance an element effectively sits on, at the given
 * percentile (2nd = darkest, for light theme; 98th = brightest, for dark),
 * as a representative RGB triple: `percentile()` gives the interpolated L*
 * number, so this re-sorts by L* and takes the nearest-rank pixel's actual
 * colour to compare against the element's text colour.
 */
function backgroundAt(pixels: Rgb[], p: number): { l: number; rgb: Rgb } {
  const Ls = pixels.map(([r, g, b]) => srgbToLstar(r, g, b));
  const l = percentile(Ls, p);
  const rank = Math.round((p / 100) * (Ls.length - 1));
  const order = Ls.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  return { l, rgb: pixels[order[rank]![1]]! };
}

/**
 * SC1: throws if the text sitting on `pixels` (sampled at the theme's
 * percentile) fails its WCAG contrast bar. Returns the measured ratio
 * otherwise. Shared between the main sweep (soft-asserted) and TC-116's
 * negative-fixture proof (expected to throw).
 */
function assertSc1(pixels: Rgb[], textRgb: Rgb, theme: Theme, large: boolean): number {
  if (pixels.length === 0) throw new Error("assertSc1: empty pixel sample");
  const { rgb: bgRgb } = backgroundAt(pixels, theme === "light" ? 2 : 98);
  const ratio = contrastRatio(textRgb, bgRgb);
  const threshold = large ? 3 : 4.5;
  if (ratio < threshold) throw new Error(`contrast ${ratio.toFixed(2)}:1 < ${threshold}:1 (large=${large})`);
  return ratio;
}

async function loadRoute(browser: Browser, baseURL: string, theme: Theme, url: string, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width, height } });
  await context.addInitScript((t) => localStorage.setItem("verilane-theme", t), theme);
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  return page;
}

const WIDTHS = (url: string) => (url === "/" ? [1440, 768, 390] : [1440, 768]);

// ── TC-113 / TC-114: SC1, text over the art meets contrast ─────────────────
for (const theme of ["light", "dark"] as const) {
  test(`TC-${theme === "light" ? "113" : "114"}: text over the art meets AA contrast in ${theme} (SC1)`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== "chromium-light", "both themes are forced via localStorage on this one project");
    // The sweep loads every route at every width in sequence (goto + networkidle
    // each time); well past the default 30s test timeout, so give it room.
    test.setTimeout(180_000);
    let sampled = 0;
    for (const { url, level } of ROUTES) {
      for (const width of WIDTHS(url)) {
        const page = await loadRoute(browser, baseURL!, theme, url, width, 900);
        try {
          const zone = await textZone(page);
          if (!zone) {
            expect.soft(zone, `${url} ${theme} ${width}: no heritage band (unexpected for level ${level})`).not.toBeNull();
            continue;
          }
          const candidates = await textZoneCandidates(page, zone);
          if (candidates.length === 0) continue;
          await page.addStyleTag({ content: candidates.map((c) => `[data-contrast-id="${c.id}"]{color:transparent !important;}`).join("\n") });
          const png = await page.screenshot();
          for (const c of candidates) {
            const pixels = await decodeRegion(png, c);
            if (pixels.length === 0) continue;
            sampled++;
            try {
              assertSc1(pixels, parseCssColor(c.colorStr), theme, c.large);
            } catch (e) {
              expect.soft(null, `${url} ${theme} ${width} ${c.id}: ${(e as Error).message}`).toBeNull();
            }
          }
        } finally {
          await page.context().close();
        }
      }
    }
    expect(sampled, "at least one text-zone element was sampled across the whole sweep").toBeGreaterThan(0);
  });
}

// ── TC-115: SC2, prominence stays inside the band per level ─────────────────
for (const theme of ["light", "dark"] as const) {
  test(`TC-115: prominence stays inside the band per level (${theme}, SC2)`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== "chromium-light", "both themes are forced via localStorage on this one project");
    // Same route × width sweep as TC-113/TC-114, plus per-route screenshotting;
    // well past the default 30s test timeout, so give it room.
    test.setTimeout(180_000);
    const peakPercentile = theme === "light" ? 2 : 98;
    for (const { url, level } of ROUTES) {
      for (const width of WIDTHS(url)) {
        const page = await loadRoute(browser, baseURL!, theme, url, width, 900);
        try {
          const { canvasL, textL } = await themeTokens(page);
          const zone = await textZone(page);
          const band = await bandBox(page);
          if (!zone || !band) {
            expect.soft(band, `${url} ${theme} ${width}: no heritage band (unexpected for level ${level})`).not.toBeNull();
            continue;
          }
          const png = await page.screenshot();
          // Outside-zone sample: the band box minus the zone rectangle, as the
          // two rects that remain (right of the zone; below the zone).
          const rightStrip: Box = { x: zone.x + zone.width, y: zone.y, width: band.x + band.width - (zone.x + zone.width), height: zone.height };
          const belowStrip: Box = { x: band.x, y: zone.y + zone.height, width: band.width, height: band.y + band.height - (zone.y + zone.height) };
          const outside = [...(await decodeRegion(png, rightStrip)), ...(await decodeRegion(png, belowStrip))];
          if (outside.length > 0) {
            const { l: peakL } = backgroundAt(outside, peakPercentile);
            const p = prominence(canvasL, peakL, textL);
            const [lo, hi] = P_BAND[level];
            expect.soft(p, `${url} ${theme} ${width} outside-zone P (level ${level})`).toBeGreaterThanOrEqual(lo);
            expect.soft(p, `${url} ${theme} ${width} outside-zone P (level ${level})`).toBeLessThanOrEqual(hi);
          }
          // Light-only text-zone floor: PRD §6.2 — art inside the zone must
          // stay at L* ≥ 92.1 so --text-muted keeps AA. Dark has no AA floor
          // in the zone ("purely aesthetic"), so only light is asserted here;
          // the outside-zone P-band check above is what gates dark.
          if (theme === "light") {
            const zonePixels = await decodeRegion(png, zone);
            if (zonePixels.length > 0) {
              const { l: zonePeakL } = backgroundAt(zonePixels, 2);
              // STOP RULE (TASK-46.6 brief): if this fails for level "normal",
              // do not weaken the assertion or invent a fix — report it. The
              // PRD's P ≤ 6.5% global fallback (R1) is a user decision.
              expect.soft(zonePeakL, `${url} ${theme} ${width} text-zone floor (level ${level})`).toBeGreaterThanOrEqual(LIGHT_ZONE_FLOOR_LSTAR);
            }
          }
        } finally {
          await page.context().close();
        }
      }
    }
  });
}

// ── TC-116: the contrast gate fails a too-dark fixture ──────────────────────
test("TC-116: the SC1 contrast gate fails against a too-dark fixture", async () => {
  const fixture = await readFile(path.join(__dirname, "fixtures", "heritage", "negative-dark.webp"));
  const pixels = await decodeRegion(fixture, { x: 0, y: 0, width: 400, height: 400 });
  expect(pixels.length).toBeGreaterThan(0);
  const lightText = hexToRgb("#17231e");
  expect(() => assertSc1(pixels, lightText, "light", false)).toThrow();
  expect(() => assertSc1(pixels, lightText, "light", true)).toThrow();
});
