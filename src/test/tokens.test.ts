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

// Design.md Revision R2 (TASK-38) re-coloured the product to the emerald
// FinTech palette, so token *values* now follow the R2 brief rather than the
// frozen mockup. The mockup still fixes the token *vocabulary*: every name it
// defines must exist in each theme block, so no component loses a colour.
const R2_BRAND: Record<string, string> = {
  canvas: "#f7f9f7",
  surface: "#fff",
  border: "#e4eae5",
  text: "#17231e",
  brand: "#176b50",
  "brand-strong": "#104b38",
  accent: "#2d9a70",
  interactive: "#21845f",
  mint: "#ddf2e7",
  "mint-pale": "#f0f8f3",
  rail: "#082f25",
};
const R2_TOKENS = ["accent", "interactive", "mint", "mint-pale", "rail-border", "info", "info-bg", "card-shadow"];
const RETIRED = ["glass", "canvas-art-opacity"];

describe("design tokens (Design.md R2)", () => {
  it("every mockup token is still defined in every theme block", () => {
    for (const [mockup, globals] of [
      [mockupLight, globalsLight],
      [mockupDarkMedia, globalsDarkMedia],
      [mockupDarkAttr, globalsDarkAttr],
    ] as const) {
      for (const name of Object.keys(mockup)) expect(globals[name], name).toBeTruthy();
    }
  });

  it("the two dark blocks are identical", () => {
    expect(globalsDarkMedia).toEqual(globalsDarkAttr);
  });

  it("light theme uses the R2 brand palette", () => {
    expect(globalsLight).toMatchObject(R2_BRAND);
  });

  it("R2 tokens exist in every block and the glass tokens are retired", () => {
    for (const block of [globalsLight, globalsDarkMedia, globalsDarkAttr]) {
      for (const name of R2_TOKENS) expect(block[name], name).toBeTruthy();
      for (const name of RETIRED) expect(block[name], name).toBeUndefined();
    }
    expect(globalsCss).not.toMatch(/@utility glass|body::before/);
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
  ["text-muted", "canvas"],
  ["text-muted", "surface-sunken"],
  ["brand-strong", "surface"],
  ["brand", "surface"],
  ["brand-strong", "mint"],
  ["on-brand", "brand"],
  ["high", "high-bg"],
  ["med", "med-bg"],
  ["low", "low-bg"],
  ["rail-text", "rail"],
  ["rail-text", "rail-active"],
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
