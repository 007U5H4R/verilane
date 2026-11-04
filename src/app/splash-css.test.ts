import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S15 guard (TASK-45.5 review): the splash moves only transform and opacity,
// so every @keyframes declaration and every transitioned property must be one
// of those two. Anything else (left, filter, background-position …) repaints.
const ALLOWED = new Set(["transform", "opacity"]);

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The body (between the outer braces) of every @keyframes block. */
export function keyframeBodies(css: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    out.push({ name: m[1] ?? "", body: css.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

/** Property names declared inside one keyframes body. */
function declaredProps(body: string): string[] {
  return [...body.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:/g)].map((d) => d[1] ?? "");
}

/** Split on commas that are not inside parentheses. */
function splitTop(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The property each transition (shorthand or transition-property) names. */
export function transitionedProps(css: string): string[] {
  const props: string[] = [];
  for (const d of css.matchAll(/(?:^|[{;\s])transition(-property)?\s*:\s*([^;}]+)/g)) {
    for (const item of splitTop(d[2] ?? "")) props.push(item.split(/\s+/)[0] ?? "");
  }
  return props;
}

export function s15Violations(raw: string): string[] {
  const css = stripComments(raw);
  const bad: string[] = [];
  for (const k of keyframeBodies(css)) {
    for (const p of declaredProps(k.body)) if (!ALLOWED.has(p)) bad.push(`@keyframes ${k.name}: ${p}`);
  }
  for (const p of transitionedProps(css)) if (!ALLOWED.has(p)) bad.push(`transition: ${p}`);
  return bad;
}

describe("splash.css S15 guard: transform and opacity only", () => {
  const css = readFileSync(join(__dirname, "splash.css"), "utf8");

  it("parses the real file's keyframes and transitions", () => {
    expect(keyframeBodies(stripComments(css)).length).toBeGreaterThan(0);
    expect(transitionedProps(stripComments(css)).length).toBeGreaterThan(0);
  });

  it("animates and transitions only transform and opacity", () => {
    expect(s15Violations(css)).toEqual([]);
  });

  it.each(["left: 10px", "filter: blur(2px)", "background-position: 0 0"])("fails on a keyframe with %j", (decl) => {
    const bad = `@keyframes k { from { opacity: 0; ${decl}; } to { transform: none; } }`;
    expect(s15Violations(bad)).toEqual([`@keyframes k: ${decl.split(":")[0]}`]);
  });

  it.each([
    ["transition: left 200ms", "left"],
    ["transition: opacity 200ms, filter 1s cubic-bezier(0, 0, 1, 1)", "filter"],
    ["transition-property: transform, background-position", "background-position"],
    ["transition: all 300ms", "all"],
  ])("fails on %j", (decl, prop) => {
    expect(s15Violations(`.a { ${decl}; }`)).toEqual([`transition: ${prop}`]);
  });
});
