/**
 * TASK-24.1 (Design §D5): the manifest's display mode and colours, pinned so
 * a future edit can't silently drift from the spec.
 */
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("declares standalone display with the design's theme and background colours", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#0f3d29");
    expect(m.background_color).toBe("#f8f7f3");
  });

  it("lists a maskable icon alongside the regular sizes", () => {
    const m = manifest();
    const purposes = (m.icons ?? []).map((icon) => icon.purpose);
    expect(purposes).toContain("maskable");
    expect((m.icons ?? []).map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
  });
});
