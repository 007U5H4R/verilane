#!/usr/bin/env tsx
/**
 * Heritage art encoder (TASK-46.5 · TC-112 · plan §A4). From one 21:9 master
 * (3360×1440 PNG) per theme it writes, into the path-B asset dir (EXE55):
 *   heritage-{theme}-desk.v2.{avif,webp}   2400 wide (or --width), aspect kept
 *   heritage-{theme}-strip.v2.{avif,webp}  1200×480, the master's 15–55%
 *                                          height band, centred horizontally
 * AVIF q45 effort 9 4:2:0; WebP q70 smart subsample; converted to sRGB with
 * every ICC/EXIF/XMP block stripped. The light theme is first toned toward the
 * canvas by LIGHT_TONE_A (EXE108). Throws on a master outside 2.2–2.5 aspect
 * or narrower than the desk width. Check the result with `pnpm image-budget`.
 *
 *   tsx scripts/encode-heritage.ts <master.png> --theme light|dark [--out dir] [--width 2000]
 *
 * Dev-only; not part of the Next build. No network calls.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import sharp, { type Sharp } from "sharp";
import { ASSET_DIR, ASSET_VERSION } from "./image-budget";

export const DESK_WIDTH = 2400;
export const STRIP = { width: 1200, height: 480 };
/** The skyline band of the master (PRD §6.2: 15–55% of frame height). */
export const STRIP_BAND = { top: 0.15, bottom: 0.55 };
/** Accepted master width:height. 21:9 is 2.33; outside this the strip would stretch. */
export const MASTER_ASPECT = { min: 2.2, max: 2.5 };

const AVIF = { quality: 45, effort: 9, chromaSubsampling: "4:2:0" } as const;
const WEBP = { quality: 70, smartSubsample: true } as const;
/**
 * Light-only tone calibration (TASK-46.8 · EXE108, Design §6.1): out = a·in + b
 * per channel, pinned at the canvas #f7f9f7 so the paper stays the canvas and
 * the line work moves toward it. The master's paper is about (245,247,245).
 * 0.81 puts the 2nd-percentile line at L* ≈ 92.5 at 1440, so SC2 P ≈ 6.2%
 * (≤ 6.5%, PRD §15 R1) with the text zone at L* ≈ 93.2 (floor 92.1). Dark is
 * not toned.
 */
export const LIGHT_TONE_A = 0.81;
const CANVAS_RGB = [247, 249, 247];
const tone = (img: Sharp, theme: "light" | "dark") =>
  theme === "light" ? img.linear([LIGHT_TONE_A, LIGHT_TONE_A, LIGHT_TONE_A], CANVAS_RGB.map((c) => c * (1 - LIGHT_TONE_A))) : img;

/** Encodes one theme's master; resolves to the 4 written file paths. */
export async function encodeHeritage(
  master: string,
  theme: "light" | "dark",
  opts: { out: string; width?: number },
): Promise<string[]> {
  const { width: mw, height: mh } = await sharp(master).metadata();
  if (!mw || !mh) throw new Error(`encode-heritage: cannot read dimensions of ${master}`);
  const aspect = mw / mh;
  if (aspect < MASTER_ASPECT.min || aspect > MASTER_ASPECT.max) {
    throw new Error(
      `encode-heritage: ${master} is ${mw}×${mh} (aspect ratio ${aspect.toFixed(2)}); expected ${MASTER_ASPECT.min}–${MASTER_ASPECT.max} (21:9 ≈ 2.33)`,
    );
  }
  const deskWidth = opts.width ?? DESK_WIDTH;
  if (mw < deskWidth) {
    throw new Error(`encode-heritage: ${master} is ${mw} px wide, narrower than the ${deskWidth} px desk width; refusing to upscale`);
  }

  // Strip crop: the 15–55% height band, widened to the strip's aspect ratio
  // and centred horizontally (clamped to the master's width).
  const bandTop = Math.round(mh * STRIP_BAND.top);
  const bandHeight = Math.round(mh * STRIP_BAND.bottom) - bandTop;
  const bandWidth = Math.min(mw, Math.round((bandHeight * STRIP.width) / STRIP.height));
  const crop = { left: Math.round((mw - bandWidth) / 2), top: bandTop, width: bandWidth, height: bandHeight };

  const variants = [
    { size: "desk", img: () => tone(sharp(master), theme).resize({ width: deskWidth }) },
    { size: "strip", img: () => tone(sharp(master), theme).extract(crop).resize(STRIP.width, STRIP.height, { fit: "fill" }) },
  ] as const;

  mkdirSync(opts.out, { recursive: true });
  const written: string[] = [];
  for (const v of variants) {
    const base = join(opts.out, `heritage-${theme}-${v.size}.${ASSET_VERSION}`);
    // No keepMetadata()/withIccProfile(): sharp writes no ICC, EXIF or XMP.
    await v.img().toColourspace("srgb").avif(AVIF).toFile(`${base}.avif`);
    await v.img().toColourspace("srgb").webp(WEBP).toFile(`${base}.webp`);
    written.push(`${base}.avif`, `${base}.webp`);
  }
  return written;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      theme: { type: "string" },
      out: { type: "string", default: join(process.cwd(), ASSET_DIR) },
      width: { type: "string" },
    },
  });
  const master = positionals[0];
  const theme = values.theme;
  if (!master || (theme !== "light" && theme !== "dark")) {
    console.error("usage: tsx scripts/encode-heritage.ts <master.png> --theme light|dark [--out dir] [--width 2000]");
    process.exit(1);
  }
  const width = values.width ? Number(values.width) : undefined;
  if (width !== undefined && !(Number.isInteger(width) && width > 0)) {
    console.error(`encode-heritage: --width must be a positive integer, got ${values.width}`);
    process.exit(1);
  }
  const files = await encodeHeritage(master, theme, { out: values.out!, width });
  for (const f of files) console.log(`wrote ${f}`);
}

if (process.argv[1] && /encode-heritage\.ts$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
