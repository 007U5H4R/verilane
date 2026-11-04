/** TASK-46.5 · TC-112: encode-heritage writes desk + strip in AVIF and WebP at the right sizes, metadata stripped. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeHeritage } from "./encode-heritage";
import { EXPECTED } from "./image-budget";

// Under TMPDIR, which the runner points at the E Drive scratch dir.
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
}

describe("encodeHeritage", () => {
  it("TC-112: writes 4 files — desk 2400×1029 and strip 1200×480, AVIF + WebP, no ICC/EXIF", async () => {
    const out = join(dir, "default");
    const files = await encodeHeritage(master, "light", { out });
    await check(files, "light", 2400, 1029);
  });

  it("TC-112: --width 2000 gives a 2000×857 desk; the strip stays 1200×480", async () => {
    const out = join(dir, "w2000");
    const files = await encodeHeritage(master, "dark", { out, width: 2000 });
    await check(files, "dark", 2000, 857);
  });
});
