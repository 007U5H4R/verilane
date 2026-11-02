import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, auditCsv, csvField, csvFileName, guardCell } from "./csv";
import { toEntry } from "./view";

describe("audit CSV", () => {
  it("guards every formula-leading character", () => {
    for (const c of ["=", "+", "-", "@", "\t", "\r"]) expect(guardCell(`${c}SUM(A1)`)).toBe(`'${c}SUM(A1)`);
    expect(guardCell("Draft approved")).toBe("Draft approved");
    expect(guardCell("")).toBe("");
  });

  it("quotes fields per RFC 4180", () => {
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField(null)).toBe('""');
    expect(csvField(7)).toBe('"7"');
  });

  it("exports the fixed columns, CRLF-separated, without payloads", () => {
    const e = toEntry({
      event_id: 3,
      action: "add_note",
      at: "2026-10-30T10:05:00+05:30",
      subject: "invoice:INV-A",
      subject_kind: "invoice",
      subject_id: "INV-A",
      invoice_id: "INV-A",
      actor_role: "analyst",
      actor_label: "Analyst",
      summary: "=HYPERLINK(\"x\")",
      after: { note: "SECRET-NOTE-BODY" },
      evidence_ids: ["ev-1"],
    });
    const csv = auditCsv([e]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.map((c) => `"${c}"`).join(","));
    expect(lines[1]).toBe(
      '"AUD-000003","2026-10-30T04:35:00.000Z","Analyst","Analyst","User","add_note","Note","Queue","invoice:INV-A","INV-A","\'=HYPERLINK(""x"")"',
    );
    expect(lines[2]).toBe("");
    expect(csv).not.toContain("SECRET-NOTE-BODY");
    expect(csv).not.toContain("ev-1");
  });

  it("a header-only file when nothing matches", () => {
    expect(auditCsv([]).split("\r\n").filter(Boolean)).toHaveLength(1);
  });

  it("names the file with the export date", () => {
    expect(csvFileName("2026-11-02")).toBe("verilane-audit-log-2026-11-02.csv");
  });
});
