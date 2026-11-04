import sharp from "sharp";

// TASK-46.6 (46.6.1): colour-maths helpers for the heritage contrast and
// prominence gates (SC1/SC2, TC-113–TC-116). Ported from the scratch
// `lstar.mjs`/`stats2.mjs` probes used in the TASK-46.3 calibration (EXE59)
// and the PRD §6.2 band maths, now typed and unit-tested against known pairs.

export type Rgb = [number, number, number];

/** `#rrggbb` → `[r, g, b]`, 0–255. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0–1) of an sRGB triple. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** CIE L* (0–100) of an sRGB triple, via CIE Y under the D65/sRGB primaries. */
export function srgbToLstar(r: number, g: number, b: number): number {
  const y = relativeLuminance([r, g, b]);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (y * 24389) / 27;
}

/** WCAG contrast ratio between two sRGB triples (order-independent, 1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Linear-interpolated percentile (0–100) of a numeric sample, nearest-rank style with interpolation. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("percentile: empty sample");
  if (p < 0 || p > 100) throw new Error(`percentile: p out of range (${p})`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/**
 * PRD §6.2: P = (L*canvas − L*peak) / (L*canvas − L*text). 0 at the canvas
 * colour, 1 at the text colour. Works for both light (peak below canvas) and
 * dark (peak above canvas) because the same sign convention applies to the
 * denominator.
 */
export function prominence(canvasL: number, peakL: number, textL: number): number {
  const span = canvasL - textL;
  if (span === 0) throw new Error("prominence: canvas and text L* are equal");
  return (canvasL - peakL) / span;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Decodes the RGB pixels (alpha dropped) inside `box` from a PNG buffer, row
 * by row, left to right. The box is clamped to the image bounds and its
 * origin floored / its extent floored, so a box partly or fully outside the
 * image yields a smaller (possibly empty) region rather than throwing.
 */
export async function decodeRegion(png: Buffer, box: Box): Promise<Rgb[]> {
  const img = sharp(png);
  const meta = await img.metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(imgW, Math.floor(box.x + box.width));
  const bottom = Math.min(imgH, Math.floor(box.y + box.height));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return [];
  const { data, info } = await img
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixels: Rgb[] = [];
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    pixels.push([data[o]!, data[o + 1]!, data[o + 2]!]);
  }
  return pixels;
}
