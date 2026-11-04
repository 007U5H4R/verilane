import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { contrastRatio, decodeRegion, hexToRgb, percentile, prominence, relativeLuminance, srgbToLstar } from "./lstar";

// TASK-46.6 (46.6.1): colour maths for the heritage contrast and prominence
// gates (TC-113–TC-116). Reference values are the Design tokens and the
// Stage 3 L*/contrast figures in Solution-PRD-TASK-46 §6.2.

const L = (hex: string) => srgbToLstar(...hexToRgb(hex));

describe("srgbToLstar", () => {
  it("maps black to 0 and white to 100", () => {
    expect(srgbToLstar(0, 0, 0)).toBe(0);
    expect(srgbToLstar(255, 255, 255)).toBeCloseTo(100, 6);
  });

  it("puts sRGB #777777 at mid-grey (L* ≈ 50)", () => {
    expect(L("#777777")).toBeCloseTo(50.03, 1);
  });

  it("uses the linear segment for very dark pixels", () => {
    // sRGB 1/255 → Y = (1/255)/12.92 ≈ 0.000304, below 216/24389 → L* = Y·24389/27.
    expect(srgbToLstar(1, 1, 1)).toBeCloseTo(0.2742, 3);
  });

  it("matches the Stage 3 token L* values (PRD §6.2)", () => {
    expect(L("#f7f9f7")).toBeCloseTo(97.7, 1); // light canvas
    expect(L("#17231e")).toBeCloseTo(12.5, 1); // light text
    expect(L("#0d1511")).toBeCloseTo(6.0, 1); // dark canvas
    expect(L("#edf4ef")).toBeCloseTo(95.6, 1); // dark text
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, in either order", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6);
  });

  it("is 1 for a colour on itself", () => {
    expect(contrastRatio([95, 108, 101], [95, 108, 101])).toBe(1);
  });

  it("reproduces the PRD §6.2 findings for --text-muted", () => {
    expect(contrastRatio(hexToRgb("#5f6c65"), hexToRgb("#c9d6cc"))).toBeCloseTo(3.66, 2);
    expect(contrastRatio(hexToRgb("#a0b0a5"), hexToRgb("#174c3a"))).toBeCloseTo(4.34, 2);
    expect(contrastRatio(hexToRgb("#a0b0a5"), hexToRgb("#1e3128"))).toBeCloseTo(6.06, 2);
  });

  it("agrees with relativeLuminance", () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
  });
});

describe("percentile", () => {
  it("interpolates linearly between ranks", () => {
    expect(percentile([0, 10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([0, 10, 20, 30, 40], 25)).toBe(10);
    expect(percentile([0, 10], 25)).toBe(2.5);
  });

  it("does not depend on input order and does not mutate it", () => {
    const values = [40, 0, 30, 10, 20];
    expect(percentile(values, 0)).toBe(0);
    expect(percentile(values, 100)).toBe(40);
    expect(values).toEqual([40, 0, 30, 10, 20]);
  });

  it("gives the 2nd percentile of 0..100 as 2", () => {
    const values = Array.from({ length: 101 }, (_, i) => 100 - i);
    expect(percentile(values, 2)).toBe(2);
    expect(percentile(values, 98)).toBe(98);
  });

  it("refuses an empty sample or an out-of-range p", () => {
    expect(() => percentile([], 50)).toThrow();
    expect(() => percentile([1], -1)).toThrow();
    expect(() => percentile([1], 101)).toThrow();
  });
});

describe("prominence", () => {
  it("is 0 at the canvas and 1 at the text", () => {
    expect(prominence(97.7, 97.7, 12.5)).toBe(0);
    expect(prominence(97.7, 12.5, 12.5)).toBe(1);
  });

  it("reproduces the PRD §6.2 values in both themes", () => {
    // Light: brief tone #C9D6CC → P 15.6 %.
    expect(prominence(L("#f7f9f7"), L("#c9d6cc"), L("#17231e"))).toBeCloseTo(0.156, 3);
    // Dark: #1e3128 → P 14.0 % (the sign works out the same when text is lighter).
    expect(prominence(L("#0d1511"), L("#1e3128"), L("#edf4ef"))).toBeCloseTo(0.14, 2);
  });
});

describe("decodeRegion", () => {
  // A 4×2 PNG: top row red, green, blue, white; bottom row black ×4.
  async function fixture(): Promise<Buffer> {
    const px = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    return sharp(Buffer.from(px), { raw: { width: 4, height: 2, channels: 3 } }).png().toBuffer();
  }

  it("returns the pixels inside the box, row by row", async () => {
    const png = await fixture();
    expect(await decodeRegion(png, { x: 1, y: 0, width: 2, height: 2 })).toEqual([
      [0, 255, 0],
      [0, 0, 255],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("drops alpha and clips fractional or out-of-bounds boxes to the image", async () => {
    const rgba = await sharp({ create: { width: 3, height: 3, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } })
      .png()
      .toBuffer();
    const px = await decodeRegion(rgba, { x: 1.6, y: 0.4, width: 10, height: 1.2 });
    expect(px.length).toBe(2); // x 1..3 (floor 1.6..1.6+10, clamped), y 0..1 (floor 0.4..1.6) → 2×1
    expect(px[0]).toEqual([10, 20, 30]);
  });

  it("returns nothing for a box entirely outside the image", async () => {
    expect(await decodeRegion(await fixture(), { x: 10, y: 10, width: 5, height: 5 })).toEqual([]);
  });
});
