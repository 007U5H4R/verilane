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
import { generateIcons, ICON_SPECS, renderIcon } from "./make-icons";

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
