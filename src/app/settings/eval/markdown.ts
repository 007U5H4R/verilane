/**
 * A minimal Markdown parser for `eval/report.md` (TASK-21.5). It covers only
 * what `toMarkdown` emits: headings, paragraphs, `-` lists, pipe tables,
 * `**bold**` and `` `code` ``. The page renders the blocks as React elements,
 * so nothing from the file is ever injected as raw HTML.
 */

export type Inline = { kind: "text" | "strong" | "code"; text: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "strong", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const DIVIDER = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

export function parseMarkdown(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, inlines: parseInline(heading[2] ?? "") });
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|") && DIVIDER.test((lines[i + 1] ?? "").trim())) {
      const header = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|")) {
        rows.push(cells(lines[i] ?? "").map(parseInline));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i] ?? "")) {
        items.push(parseInline((lines[i] ?? "").replace(/^\s*-\s+/, "")));
        i++;
      }
      blocks.push({ kind: "list", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (l.trim() === "" || /^#{1,3}\s/.test(l) || /^\s*-\s+/.test(l) || l.trimStart().startsWith("|")) break;
      para.push(l.trim());
      i++;
    }
    blocks.push({ kind: "paragraph", inlines: parseInline(para.join(" ")) });
  }
  return blocks;
}
