import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TC-002 (tokens): globals.css must stay in lockstep with the approved
// mockup's design tokens — any drift here is either an un-reviewed design
// change or a transcription bug.

const MOCKUP_PATH = join(
  process.cwd(),
  ".design/exploration/final/mockup.html",
);
const GLOBALS_PATH = join(process.cwd(), "src/app/globals.css");

/** Pull the first `{ ... }` body that follows `selector` (single-level, no nested braces). */
function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`selector not found: ${selector}`);
  }
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

/** Parse `--token: value;` declarations out of a rule body into a normalized map. */
function parseTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;
    tokens[name] = value.replace(/\s+/g, "").toLowerCase();
  }
  return tokens;
}

const mockupCss = readFileSync(MOCKUP_PATH, "utf-8");
const globalsCss = readFileSync(GLOBALS_PATH, "utf-8");

const mockupLight = parseTokens(extractBlock(mockupCss, ":root{"));
const mockupDarkMedia = parseTokens(
  extractBlock(mockupCss, ':root:not([data-theme="light"]){'),
);
const mockupDarkAttr = parseTokens(
  extractBlock(mockupCss, ':root[data-theme="dark"]{'),
);

const globalsLight = parseTokens(extractBlock(globalsCss, ":root {"));
const globalsDarkMedia = parseTokens(
  extractBlock(globalsCss, ':root:not([data-theme="light"]) {'),
);
const globalsDarkAttr = parseTokens(
  extractBlock(globalsCss, ':root[data-theme="dark"] {'),
);

describe("design tokens match the approved mockup", () => {
  it("light theme (:root)", () => {
    expect(globalsLight).toEqual(mockupLight);
  });

  it("dark theme (prefers-color-scheme media query)", () => {
    expect(globalsDarkMedia).toEqual(mockupDarkMedia);
  });

  it("dark theme ([data-theme=dark] override)", () => {
    expect(globalsDarkAttr).toEqual(mockupDarkAttr);
  });
});

// --- WCAG contrast -----------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [r, g, b].map(channel);
  return 0.2126 * (rl ?? 0) + 0.7152 * (gl ?? 0) + 0.0722 * (bl ?? 0);
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(hexToRgb(fgHex));
  const l2 = relativeLuminance(hexToRgb(bgHex));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Text/background pairs that must remain legible (WCAG AA, ≥4.5:1) in both themes.
const TEXT_PAIRS: Array<[fg: string, bg: string]> = [
  ["text", "canvas"],
  ["text", "surface"],
  ["text-muted", "surface"],
  ["brand-strong", "surface"],
  ["rail-text", "rail"],
];

// Tokens not redefined in the dark override still inherit from :root.
const globalsDarkEffective = { ...globalsLight, ...globalsDarkAttr };

describe("token contrast meets WCAG AA (4.5:1)", () => {
  for (const [fg, bg] of TEXT_PAIRS) {
    it(`light: ${fg} on ${bg}`, () => {
      const ratio = contrastRatio(
        globalsLight[fg] ?? "",
        globalsLight[bg] ?? "",
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it(`dark: ${fg} on ${bg}`, () => {
      const ratio = contrastRatio(
        globalsDarkEffective[fg] ?? "",
        globalsDarkEffective[bg] ?? "",
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});
