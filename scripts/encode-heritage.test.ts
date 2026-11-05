/** TASK-46.5 · TC-112: encode-heritage writes desk + strip in AVIF and WebP at the right sizes, metadata stripped. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import sharp, { type Sharp } from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeHeritage, LIGHT_TONE_A } from "./encode-heritage";
import { EXPECTED } from "./image-budget";

// os.tmpdir() honours TMPDIR; nothing sets it for you, so export it to the E Drive
// scratch dir when running, or the fixture lands on the internal disk.
let dir: string;
let master: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "encode-heritage-"));
  master = join(dir, "master.png");
  // Synthetic 3360×1440 master carrying a Display-P3 ICC profile and EXIF,
  // so "no ICC/EXIF" in the outputs proves the encoder strips them.
  const w = 3360;
  const h = 1440;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = (x * 255) / w;
      raw[i + 1] = (y * 255) / h;
      raw[i + 2] = 200;
    }
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .withIccProfile("p3")
    .withExif({ IFD0: { Copyright: "TC-112 fixture" } })
    .png()
    .toFile(master);
  const m = await sharp(master).metadata();
  expect(m.icc).toBeDefined();
  expect(m.exif).toBeDefined();
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** One pixel as [r, g, b] after any colour conversion sharp applies on read. */
async function pixel(img: Sharp, x: number, y: number): Promise<number[]> {
  return [...(await img.extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer())];
}

async function check(files: string[], theme: "light" | "dark", deskW: number, deskH: number) {
  expect(files).toHaveLength(4);
  expect(files.map((f) => basename(f)).sort()).toEqual(
    EXPECTED.filter((n) => n.startsWith(`heritage-${theme}-`)).sort(),
  );
  for (const f of files) {
    const m = await sharp(f).metadata();
    const isDesk = /-desk\./.test(f);
    expect([m.width, m.height], f).toEqual(isDesk ? [deskW, deskH] : [1200, 480]);
    if (f.endsWith(".avif")) {
      expect(m.format, f).toBe("heif");
      expect(m.compression, f).toBe("av1");
    } else {
      expect(m.format, f).toBe("webp");
    }
    expect(m.icc, f).toBeUndefined();
    expect(m.exif, f).toBeUndefined();
  }

  // Colour: a saturated cyan-green desk pixel must match the master converted
  // from P3 to sRGB (red ≈ 24), not the stored P3 numbers (red ≈ 107), which
  // is what an encoder that ignored the ICC profile would write.
  const mw = 3360;
  const mh = 1440;
  const dx = Math.round(deskW * 0.1);
  const dy = Math.round(deskH * 0.9);
  const srgb = await pixel(sharp(master).toColourspace("srgb"), Math.round((dx * mw) / deskW), Math.round((dy * mh) / deskH));
  // Light is toned toward the canvas #f7f9f7 by LIGHT_TONE_A (EXE108); dark is not.
  const canvas = [247, 249, 247];
  const want = theme === "light" ? srgb.map((v, c) => LIGHT_TONE_A * v + (1 - LIGHT_TONE_A) * canvas[c]!) : srgb;
  for (const f of files.filter((f) => /-desk\./.test(f))) {
    const got = await pixel(sharp(f), dx, dy);
    for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!), `${f} channel ${c}: ${got} vs ${want}`).toBeLessThanOrEqual(8);
  }
}

// AVIF at effort 9 (the real setting) takes ~8 s per test idle; 120 s leaves room
// for a parallel build on the same machine and is still a finite cap.
const ENCODE_TIMEOUT = 120_000;

describe("encodeHeritage", () => {
  it("pins LIGHT_TONE_A at 0.81, the value calibrated against TC-115's light-normal ceiling (EXE108)", () => {
    // Changing it moves light normal and light reduced P; re-run the TC-115 sampler and update EXE108 first.
    expect(LIGHT_TONE_A).toBe(0.81);
  });

  it("TC-112: writes 4 files — desk 2400×1029 and strip 1200×480, AVIF + WebP, no ICC/EXIF", async () => {
    const out = join(dir, "default");
    const files = await encodeHeritage(master, "light", { out });
    await check(files, "light", 2400, 1029);
  }, ENCODE_TIMEOUT);

  it("TC-112: --width 2000 gives a 2000×857 desk; the strip stays 1200×480", async () => {
    const out = join(dir, "w2000");
    const files = await encodeHeritage(master, "dark", { out, width: 2000 });
    await check(files, "dark", 2000, 857);
  }, ENCODE_TIMEOUT);

  it("refuses a master whose aspect ratio is outside 2.2–2.5 instead of stretching the strip", async () => {
    const square = join(dir, "square.png");
    await sharp({ create: { width: 2400, height: 2400, channels: 3, background: "#888" } }).png().toFile(square);
    await expect(encodeHeritage(square, "light", { out: join(dir, "square-out") })).rejects.toThrow(/aspect ratio 1\.00.*2\.2–2\.5/);
    const tooWide = join(dir, "too-wide.png");
    await sharp({ create: { width: 3600, height: 1200, channels: 3, background: "#888" } }).png().toFile(tooWide);
    await expect(encodeHeritage(tooWide, "light", { out: join(dir, "wide-out") })).rejects.toThrow(/aspect ratio 3\.00/);
  }, ENCODE_TIMEOUT);

  it("refuses a master narrower than the desk width instead of upscaling it", async () => {
    const small = join(dir, "small.png");
    await sharp({ create: { width: 2000, height: 860, channels: 3, background: "#888" } }).png().toFile(small);
    await expect(encodeHeritage(small, "light", { out: join(dir, "small-out") })).rejects.toThrow(/2000 px wide.*2400/);
    // The same master is fine when the requested desk width fits.
    expect(await encodeHeritage(small, "dark", { out: join(dir, "small-ok"), width: 2000 })).toHaveLength(4);
  }, ENCODE_TIMEOUT);
});
