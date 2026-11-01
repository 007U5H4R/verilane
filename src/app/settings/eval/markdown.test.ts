import { describe, expect, test } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  test("splits bold and code from plain text", () => {
    expect(parseInline("provider `simulated` · **failed** run")).toEqual([
      { kind: "text", text: "provider " },
      { kind: "code", text: "simulated" },
      { kind: "text", text: " · " },
      { kind: "strong", text: "failed" },
      { kind: "text", text: " run" },
    ]);
  });

  test("keeps HTML-looking text as plain text", () => {
    expect(parseInline("<script>x</script>")).toEqual([{ kind: "text", text: "<script>x</script>" }]);
  });
});

describe("parseMarkdown", () => {
  test("parses headings, paragraphs, lists and tables", () => {
    const md = [
      "# Evaluation report",
      "",
      "Line one",
      "line two",
      "",
      "## Gates",
      "",
      "| Gate | Seed |",
      "| --- | --- |",
      "| Amount | PASS |",
      "| Dispute | FAIL |",
      "",
      "- a",
      "- b",
    ].join("\n");
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "heading", "table", "list"]);
    expect(blocks[1]).toEqual({ kind: "paragraph", inlines: [{ kind: "text", text: "Line one line two" }] });
    const table = blocks[3];
    if (table?.kind !== "table") throw new Error("expected a table");
    expect(table.header).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]?.[1]).toEqual([{ kind: "text", text: "FAIL" }]);
    const list = blocks[4];
    if (list?.kind !== "list") throw new Error("expected a list");
    expect(list.items).toHaveLength(2);
  });

  test("returns no blocks for an empty file", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});
