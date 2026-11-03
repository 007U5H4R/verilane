/**
 * PWA icon generation (TASK-24.2 / Design.md §13.6): the existing logo
 * mark — the standalone ribbon glyph, left of the "Verilane" wordmark —
 * cropped unaltered (no redraw/recolour/stretch) and centred on a white
 * safe-zone square inside a `--rail` (#0f3d29) frame, generous padding so
 * the composition sits inside a maskable icon's ~80%-diameter safe circle.
 * `public/brand/verilane-logo.png` itself is never modified (its sha256 is
 * pinned by `src/test/logo.test.ts`).
 *
 * Run via `tsx scripts/make-icons.ts` (dev-only; not part of the Next build).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const LOGO_PATH = join(process.cwd(), "public", "brand", "verilane-logo.png");

// The mark's tight pixel bounding box within the 2172×724 logo canvas,
// found by scanning for non-transparent pixels (column/row runs): the
// standalone "V" ribbon glyph, left of the wordmark's first letter.
// Columns 213–642 inclusive: 430 wide, so the last anti-aliased column
// (alpha up to 24) is kept (TASK-35 / T24-11). Pinned by make-icons.test.ts.
export const MARK_CROP = { left: 213, top: 204, width: 430, height: 317 };

const RAIL = { r: 0x0f, g: 0x3d, b: 0x29, alpha: 1 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

export interface IconSpec {
  file: string;
  size: number;
  /** Manifest `purpose`; "maskable" keeps the same generous padding that a
   * non-maskable icon also gets here, since there's one treatment (24.2). */
  purpose: "any" | "maskable";
}

export const ICON_SPECS: IconSpec[] = [
  { file: "icon-192.png", size: 192, purpose: "any" },
  { file: "icon-512.png", size: 512, purpose: "any" },
  { file: "icon-maskable-512.png", size: 512, purpose: "maskable" },
];

/** Renders one icon PNG at `size`, returning its bytes. */
export async function renderIcon(size: number): Promise<Buffer> {
  const mark = await sharp(LOGO_PATH).extract(MARK_CROP).toBuffer();

  // Generous padding: the white safe-zone is 56% of the canvas, so the
  // composition fits inside a centred circle of ~80% diameter (maskable
  // icons' safe zone) with room to spare.
  const safeZone = Math.round(size * 0.56);
  const markBox = Math.round(safeZone * 0.6);

  const markResized = await sharp(mark)
    .resize({ width: markBox, height: markBox, fit: "inside" })
    .toBuffer();
  const markMeta = await sharp(markResized).metadata();
  const markW = markMeta.width ?? markBox;
  const markH = markMeta.height ?? markBox;

  const whiteSquare = await sharp({
    create: { width: safeZone, height: safeZone, channels: 4, background: WHITE },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: RAIL },
  })
    .composite([
      { input: whiteSquare, left: Math.round((size - safeZone) / 2), top: Math.round((size - safeZone) / 2) },
      { input: markResized, left: Math.round((size - markW) / 2), top: Math.round((size - markH) / 2) },
    ])
    .png()
    .toBuffer();
}

/** Renders every `ICON_SPECS` entry into `dir` (default `public/icons`). */
export async function generateIcons(dir: string = join(process.cwd(), "public", "icons")): Promise<void> {
  mkdirSync(dir, { recursive: true });
  for (const spec of ICON_SPECS) {
    const buf = await renderIcon(spec.size);
    await sharp(buf).toFile(join(dir, spec.file));
  }
}

// CLI entry (mirrors scripts/seed.ts's guard).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateIcons()
    .then(() => console.log("Wrote", ICON_SPECS.map((s) => s.file).join(", "), "to public/icons/"))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
