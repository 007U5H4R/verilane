import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TC-089 (unit half): public/og.png must stay exactly 1200×630 and under
// 5 MB, and the source it was rendered from must reference the real,
// unmodified brand logo asset (not a redrawn/recoloured copy) — mirrors
// src/test/logo.test.ts's sha256 pin so the two tests fail together if
// either asset drifts.
const LOGO_SHA256 =
  "a67a3aca8605bf0ec0b0abcf553acc45791a898e474de3de4da96767114398d6";

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  // IHDR chunk: width/height are big-endian uint32s at bytes 16-23.
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("public/og.png", () => {
  const pngPath = join(process.cwd(), "public/og.png");
  const bytes = readFileSync(pngPath);

  it("is exactly 1200x630", () => {
    expect(pngDimensions(bytes)).toEqual({ width: 1200, height: 630 });
  });

  it("is under 5 MB", () => {
    const { size } = statSync(pngPath);
    expect(size).toBeLessThan(5 * 1024 * 1024);
  });

  it("was rendered from the og.html source that references the real logo file", () => {
    const html = readFileSync(
      join(process.cwd(), ".design/exploration/og/og.html"),
      "utf8",
    );
    expect(html).toContain("public/brand/verilane-logo.png");
  });

  it("the referenced logo asset is unmodified", () => {
    const logoBytes = readFileSync(
      join(process.cwd(), "public/brand/verilane-logo.png"),
    );
    const hash = createHash("sha256").update(logoBytes).digest("hex");
    expect(hash).toBe(LOGO_SHA256);
  });
});
