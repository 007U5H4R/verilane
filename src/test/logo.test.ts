import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TC-003: the brand logo asset must not silently drift (wrong export,
// re-compression, accidental overwrite) — pin its content hash.
const LOGO_SHA256 =
  "a67a3aca8605bf0ec0b0abcf553acc45791a898e474de3de4da96767114398d6";

describe("brand logo", () => {
  it("matches the recorded sha256", () => {
    const bytes = readFileSync(
      join(process.cwd(), "public/brand/verilane-logo.png"),
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(hash).toBe(LOGO_SHA256);
  });
});
