/**
 * TASK-24.2: the icon generator crops the existing mark unaltered and never
 * touches `public/brand/verilane-logo.png` (its sha256 is separately pinned
 * by `src/test/logo.test.ts`); each rendered icon is a square PNG at its
 * declared size.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { generateIcons, ICON_SPECS, MARK_CROP, renderIcon } from "./make-icons";

const SCRATCH_ROOT = "/Volumes/E Drive/Dev/.scratch";
const LOGO_PATH = join(process.cwd(), "public", "brand", "verilane-logo.png");

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

describe("make-icons", () => {
  it("never modifies the source logo file", async () => {
    const before = createHash("sha256").update(readFileSync(LOGO_PATH)).digest("hex");
    await renderIcon(512);
    const after = createHash("sha256").update(readFileSync(LOGO_PATH)).digest("hex");
    expect(after).toBe(before);
  });

  it("renders each spec at its declared square size", async () => {
    for (const spec of ICON_SPECS) {
      const buf = await renderIcon(spec.size);
      const meta = await sharp(buf).metadata();
      expect(meta.width).toBe(spec.size);
      expect(meta.height).toBe(spec.size);
    }
  });

  // TASK-35 (T24-11): the crop must hold every non-transparent pixel of the
  // mark, including its last anti-aliased column. The mark is the first run
  // of non-empty columns (a transparent gap separates it from the wordmark).
  // Alpha <= 8 is ignored: the PNG carries scattered alpha-1..6 noise far
  // from any glyph; the mark's own edge pixels start at alpha 24.
  it("crops exactly the mark's measured alpha bounding box", async () => {
    const ALPHA_NOISE = 8;
    const { data, info } = await sharp(LOGO_PATH).ensureAlpha().extractChannel("alpha").raw().toBuffer({
      resolveWithObject: true,
    });
    const opaque = (x: number, y: number) => data[y * info.width + x]! > ALPHA_NOISE;
    const columnHasInk = (x: number) => {
      for (let y = 0; y < info.height; y++) if (opaque(x, y)) return true;
      return false;
    };
    let left = 0;
    while (!columnHasInk(left)) left++;
    let right = left;
    while (columnHasInk(right + 1)) right++;
    let top = info.height;
    let bottom = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = left; x <= right; x++) {
        if (opaque(x, y)) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    expect(MARK_CROP).toEqual({ left, top, width: right - left + 1, height: bottom - top + 1 });
  });

  it("has the committed public/icons regenerated from the current crop", async () => {
    for (const spec of ICON_SPECS) {
      const fresh = await sharp(await renderIcon(spec.size)).raw().toBuffer();
      const committed = await sharp(join(process.cwd(), "public", "icons", spec.file)).ensureAlpha().raw().toBuffer();
      expect(committed.equals(fresh), spec.file).toBe(true);
    }
  });

  it("writes every spec's file to the output directory", async () => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const dir = mkdtempSync(join(SCRATCH_ROOT, "verilane-icons-"));
    created.push(dir);

    await generateIcons(dir);

    for (const spec of ICON_SPECS) {
      const meta = await sharp(join(dir, spec.file)).metadata();
      expect(meta.width).toBe(spec.size);
      expect(meta.format).toBe("png");
    }
  });
});
