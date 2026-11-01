import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";

import { parseMarkdown, type Block, type Inline } from "./markdown";

// TASK-21.5: the committed `eval/report.md`, read with synchronous I/O so it
// is prerendered into the static shell at build time (Next 16 caching docs,
// "Predictable values"). Run `pnpm eval` and rebuild to refresh it.
function readReport(): string | null {
  const file = join(process.cwd(), "eval", "report.md");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return inlines.map((p, i) => {
    if (p.kind === "strong") return <strong key={i} className="font-semibold text-text">{p.text}</strong>;
    if (p.kind === "code") {
      return (
        <code key={i} className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[12px]">
          {p.text}
        </code>
      );
    }
    return <span key={i}>{p.text}</span>;
  });
}

/** Colour a table cell that starts with a gate verdict. */
function verdictClass(inlines: Inline[]): string {
  const first = inlines[0]?.text ?? "";
  if (first.startsWith("FAIL")) return "font-semibold text-high";
  if (first.startsWith("PASS")) return "text-low";
  return "";
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      if (block.level === 1) return null; // the page header carries the title
      const Tag = block.level === 2 ? "h2" : "h3";
      return (
        <Tag className={block.level === 2 ? "mt-4 text-[18px] font-semibold text-text" : "mt-2 font-semibold text-text"}>
          <Inlines inlines={block.inlines} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="text-[13px] text-text-muted">
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-text-muted [overflow-wrap:anywhere]">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines inlines={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-surface-sunken">
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-text">
                    <Inlines inlines={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-t border-border">
                  {row.map((cell, c) => (
                    <td key={c} className={`whitespace-nowrap px-3 py-2 text-text ${verdictClass(cell)}`}>
                      <Inlines inlines={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default function EvalPage() {
  const md = readReport();
  const blocks = md === null ? [] : parseMarkdown(md);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-3 p-4 md:p-7">
      <header className="flex flex-col gap-1">
        <Link href="/settings" className="w-fit text-[13px] font-medium text-brand underline underline-offset-2">
          Back to Settings
        </Link>
        <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
          Evaluation report
        </h1>
        <p className="text-text-muted">
          The offline <code className="font-mono text-[13px]">pnpm eval</code> run against the seed and held-out sets,
          as of the last build.
        </p>
      </header>
      {blocks.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-5 text-[13px] text-text-muted">
          No evaluation report yet. Run <code className="font-mono">pnpm eval</code>, then rebuild.
        </p>
      ) : (
        blocks.map((block, i) => <BlockView key={i} block={block} />)
      )}
    </div>
  );
}
