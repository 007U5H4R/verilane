import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseImport } from "@/store/csv";
import {
  checkFile,
  countDataRows,
  formatBytes,
  MAX_IMPORT_BYTES,
  summarizeImport,
} from "./importPreview";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/e2e/fixtures", name), "utf8");

describe("checkFile", () => {
  it("accepts a CSV", () => {
    expect(checkFile({ name: "good.csv", size: 120, type: "text/csv" })).toBeNull();
    expect(checkFile({ name: "GOOD.CSV", size: 120, type: "" })).toBeNull();
  });

  it("rejects other file types", () => {
    expect(checkFile({ name: "ledger.xlsx", size: 120, type: "" })).toMatch(/not a CSV/);
    expect(checkFile({ name: "fake.csv", size: 120, type: "image/png" })).toMatch(/not a CSV/);
  });

  it("rejects empty and oversized files", () => {
    expect(checkFile({ name: "a.csv", size: 0, type: "text/csv" })).toMatch(/empty/);
    expect(checkFile({ name: "a.csv", size: MAX_IMPORT_BYTES + 1, type: "text/csv" })).toMatch(
      /limit is 5\.0 MB/,
    );
  });
});

describe("summarizeImport", () => {
  it("counts a valid file as all valid", () => {
    const text = fixture("good-invoices.csv");
    const parsed = parseImport("invoices", text);
    expect(parsed.ok).toBe(true);
    expect(summarizeImport(countDataRows(text), parsed.ok ? [] : parsed.error)).toEqual({
      total: 6,
      valid: 6,
      invalid: 0,
      fileErrors: 0,
    });
  });

  it("counts every row invalid when a column is missing", () => {
    const text = fixture("bad-invoices.csv");
    const parsed = parseImport("invoices", text);
    if (parsed.ok) throw new Error("fixture should be rejected");
    const s = summarizeImport(countDataRows(text), parsed.error);
    expect(s.fileErrors).toBeGreaterThan(0);
    expect(s.valid).toBe(0);
    expect(s.invalid).toBe(s.total);
  });

  it("counts distinct bad rows when the header is fine", () => {
    const header = fixture("good-invoices.csv").split("\n")[0];
    const text = [
      header,
      "1,INV-1,N-1,C-1,2026-09-01,2026-10-01,100,INR,open,2026-09,PO-1",
      "2,INV-2,N-2,C-1,31/09/2026,2026-10-01,-5,INR,open,2026-09,PO-2",
      "3,INV-3,N-3,C-1,2026-09-01,2026-10-01,100,INR,open,2026-09,PO-3",
    ].join("\n");
    const parsed = parseImport("invoices", text);
    if (parsed.ok) throw new Error("row 2 should be rejected");
    expect(parsed.error.length).toBe(2); // two bad fields, one row
    expect(summarizeImport(countDataRows(text), parsed.error)).toEqual({
      total: 3,
      valid: 2,
      invalid: 1,
      fileErrors: 0,
    });
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
