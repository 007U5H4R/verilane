/** TASK-46.5 · TC-109–TC-111: the heritage image budget fails oversized and missing assets. */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkBudget, DESK_BUDGET, EXPECTED, listAssets, STRIP_BUDGET } from "./image-budget";

const KB = 1024;
const allSmall = () => EXPECTED.map((name) => ({ name, bytes: 10 * KB }));
const withSize = (name: string, bytes: number) =>
  allSmall().map((f) => (f.name === name ? { name, bytes } : f));

describe("checkBudget", () => {
  it("expects 8 path-B files: 2 themes x desk/strip x avif/webp", () => {
    expect([...EXPECTED].sort()).toEqual(
      [
        "heritage-dark-desk.v2.avif",
        "heritage-dark-desk.v2.webp",
        "heritage-dark-strip.v2.avif",
        "heritage-dark-strip.v2.webp",
        "heritage-light-desk.v2.avif",
        "heritage-light-desk.v2.webp",
        "heritage-light-strip.v2.avif",
        "heritage-light-strip.v2.webp",
      ].sort(),
    );
    expect(DESK_BUDGET).toBe(60 * KB);
    expect(STRIP_BUDGET).toBe(25 * KB);
  });

  it("passes when all 8 files are present and within budget", () => {
    expect(checkBudget(allSmall(), EXPECTED)).toEqual({ ok: true, errors: [] });
  });

  it("TC-109: fails a desk asset over 60 KB, naming the file, its size and the limit", () => {
    for (const name of ["heritage-light-desk.v2.avif", "heritage-light-desk.v2.webp"]) {
      // 61 KB = 62 464 bytes. TC-109's "61 440" is exactly 60 KB, which is within budget (EXE91).
      const res = checkBudget(withSize(name, 61 * KB), EXPECTED);
      expect(res.ok).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain(name);
      expect(res.errors[0]).toContain("62464");
      expect(res.errors[0]).toContain("60 KB");
    }
    // Exactly at the limit is within budget.
    expect(checkBudget(withSize("heritage-dark-desk.v2.avif", 60 * KB), EXPECTED).ok).toBe(true);
  });

  it("TC-110: fails a strip asset over 25 KB; a 25 600-byte strip passes", () => {
    const over = checkBudget(withSize("heritage-dark-strip.v2.webp", 26_624), EXPECTED);
    expect(over.ok).toBe(false);
    expect(over.errors).toHaveLength(1);
    expect(over.errors[0]).toContain("heritage-dark-strip.v2.webp");
    expect(over.errors[0]).toContain("26624");
    expect(over.errors[0]).toContain("25 KB");

    expect(checkBudget(withSize("heritage-dark-strip.v2.webp", 25_600), EXPECTED).ok).toBe(true);
    // A strip-sized file under the desk limit is still held to the strip limit.
    expect(checkBudget(withSize("heritage-light-strip.v2.avif", 40 * KB), EXPECTED).ok).toBe(false);
  });

  it("budgets heritage files outside the expected list too (e.g. a .v3 left beside .v2)", () => {
    const res = checkBudget(
      [...allSmall(), { name: "heritage-light-desk.v3.avif", bytes: 70 * KB }],
      EXPECTED,
    );
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("heritage-light-desk.v3.avif");
  });

  it("budgets size variants such as desk@2x and desk-2x against the desk limit", () => {
    for (const name of ["heritage-light-desk@2x.v2.avif", "heritage-dark-desk-2x.v2.webp"]) {
      const res = checkBudget([...allSmall(), { name, bytes: 61 * KB }], EXPECTED);
      expect(res.ok, name).toBe(false);
      expect(res.errors[0]).toContain("60 KB desk");
    }
    const strip = checkBudget([...allSmall(), { name: "heritage-light-strip@2x.v2.avif", bytes: 26 * KB }], EXPECTED);
    expect(strip.errors[0]).toContain("25 KB strip");
  });

  it("TC-111: fails when an expected file is missing, listing it", () => {
    const seven = allSmall().filter((f) => f.name !== "heritage-dark-strip.v2.avif");
    const res = checkBudget(seven, EXPECTED);
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual([expect.stringContaining("heritage-dark-strip.v2.avif")]);
  });

  it("TC-111: fails on an empty directory, listing all 8 missing names", () => {
    const res = checkBudget([], EXPECTED);
    expect(res.ok).toBe(false);
    for (const name of EXPECTED) {
      expect(res.errors.some((e) => e.includes(name))).toBe(true);
    }
  });
});

// os.tmpdir() honours TMPDIR; export it to the E Drive scratch dir when running.
const scratch = mkdtempSync(join(tmpdir(), "image-budget-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("listAssets", () => {
  it("treats an absent directory as empty, so every expected file is reported missing", () => {
    expect(listAssets(join(scratch, "nope"))).toEqual([]);
  });

  it("throws, naming the path and error code, when the directory exists but can't be read", () => {
    const file = join(scratch, "not-a-dir");
    writeFileSync(file, "x");
    expect(() => listAssets(file)).toThrow(`cannot read ${file}: ENOTDIR`);
  });

  it("throws when one entry can't be stat'd instead of silently dropping it", () => {
    const dir = join(scratch, "dangling");
    mkdirSync(dir);
    symlinkSync(join(dir, "gone"), join(dir, "heritage-light-desk.v2.avif"));
    expect(() => listAssets(dir)).toThrow(`cannot read ${join(dir, "heritage-light-desk.v2.avif")}: ENOENT`);
  });

  it("lists files with byte sizes and skips subdirectories", () => {
    const dir = join(scratch, "ok");
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "heritage-light-desk.v2.avif"), Buffer.alloc(123));
    expect(listAssets(dir)).toEqual([{ name: "heritage-light-desk.v2.avif", bytes: 123 }]);
  });
});

describe("image-budget CLI", () => {
  const run = (...args: string[]) =>
    spawnSync(join(process.cwd(), "node_modules", ".bin", "tsx"), ["scripts/image-budget.ts", ...args], {
      encoding: "utf8",
    });

  it("checks the directory given as the first argument, not public/heritage", () => {
    // The repo's placeholders pass, so a failure here proves the argument was read.
    const dir = join(scratch, "cli-seven");
    mkdirSync(dir);
    for (const name of EXPECTED.slice(1)) writeFileSync(join(dir, name), Buffer.alloc(100));
    const res = run(dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`image-budget: ${EXPECTED[0]} is missing`);
    expect(res.stderr).toContain(`1 problem(s) in ${dir}`);
  }, 30_000);

  it("prints 'cannot read <dir>: <code>' and exits 1 on an unreadable directory", () => {
    const file = join(scratch, "cli-not-a-dir");
    writeFileSync(file, "x");
    const res = run(file);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`image-budget: cannot read ${file}: ENOTDIR`);
  }, 30_000);
});
