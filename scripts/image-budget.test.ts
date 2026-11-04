/** TASK-46.5 · TC-109–TC-111: the heritage image budget fails oversized and missing assets. */
import { describe, expect, it } from "vitest";
import { checkBudget, DESK_BUDGET, EXPECTED, STRIP_BUDGET } from "./image-budget";

const KB = 1024;
const allSmall = () => EXPECTED.map((name) => ({ name, bytes: 10 * KB }));
const withSize = (name: string, bytes: number) =>
  allSmall().map((f) => (f.name === name ? { name, bytes } : f));

describe("checkBudget", () => {
  it("expects 8 path-B files: 2 themes x desk/strip x avif/webp", () => {
    expect([...EXPECTED].sort()).toEqual(
      [
        "heritage-dark-desk.v1.avif",
        "heritage-dark-desk.v1.webp",
        "heritage-dark-strip.v1.avif",
        "heritage-dark-strip.v1.webp",
        "heritage-light-desk.v1.avif",
        "heritage-light-desk.v1.webp",
        "heritage-light-strip.v1.avif",
        "heritage-light-strip.v1.webp",
      ].sort(),
    );
    expect(DESK_BUDGET).toBe(60 * KB);
    expect(STRIP_BUDGET).toBe(25 * KB);
  });

  it("passes when all 8 files are present and within budget", () => {
    expect(checkBudget(allSmall(), EXPECTED)).toEqual({ ok: true, errors: [] });
  });

  it("TC-109: fails a desk asset over 60 KB, naming the file, its size and the limit", () => {
    for (const name of ["heritage-light-desk.v1.avif", "heritage-light-desk.v1.webp"]) {
      // 61 KB = 62 464 bytes. TC-109's "61 440" is exactly 60 KB, which is within budget (EXE91).
      const res = checkBudget(withSize(name, 61 * KB), EXPECTED);
      expect(res.ok).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain(name);
      expect(res.errors[0]).toContain("62464");
      expect(res.errors[0]).toContain("60 KB");
    }
    // Exactly at the limit is within budget.
    expect(checkBudget(withSize("heritage-dark-desk.v1.avif", 60 * KB), EXPECTED).ok).toBe(true);
  });

  it("TC-110: fails a strip asset over 25 KB; a 25 600-byte strip passes", () => {
    const over = checkBudget(withSize("heritage-dark-strip.v1.webp", 26_624), EXPECTED);
    expect(over.ok).toBe(false);
    expect(over.errors).toHaveLength(1);
    expect(over.errors[0]).toContain("heritage-dark-strip.v1.webp");
    expect(over.errors[0]).toContain("26624");
    expect(over.errors[0]).toContain("25 KB");

    expect(checkBudget(withSize("heritage-dark-strip.v1.webp", 25_600), EXPECTED).ok).toBe(true);
    // A strip-sized file under the desk limit is still held to the strip limit.
    expect(checkBudget(withSize("heritage-light-strip.v1.avif", 40 * KB), EXPECTED).ok).toBe(false);
  });

  it("budgets heritage files outside the expected list too (e.g. a .v2 left beside .v1)", () => {
    const res = checkBudget(
      [...allSmall(), { name: "heritage-light-desk.v2.avif", bytes: 70 * KB }],
      EXPECTED,
    );
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("heritage-light-desk.v2.avif");
  });

  it("TC-111: fails when an expected file is missing, listing it", () => {
    const seven = allSmall().filter((f) => f.name !== "heritage-dark-strip.v1.avif");
    const res = checkBudget(seven, EXPECTED);
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual([expect.stringContaining("heritage-dark-strip.v1.avif")]);
  });

  it("TC-111: fails on an empty directory, listing all 8 missing names", () => {
    const res = checkBudget([], EXPECTED);
    expect(res.ok).toBe(false);
    for (const name of EXPECTED) {
      expect(res.errors.some((e) => e.includes(name))).toBe(true);
    }
  });
});
