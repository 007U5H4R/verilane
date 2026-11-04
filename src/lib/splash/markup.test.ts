import { describe, expect, it } from "vitest";
import { splashMarkup } from "./markup";

// TASK-45.4 (Design §7): the bar's server markup. One polite status, a
// non-live progressbar that starts at 10 and hidden until the 3.2 s reveal.
describe("splashMarkup · progress bar (45.4)", () => {
  const html = splashMarkup();

  it("has exactly one role=status and it is polite", () => {
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toMatch(/role="status" aria-live="polite"/);
  });

  it("has one progressbar with its range, start value and text", () => {
    expect(html.match(/role="progressbar"/g)).toHaveLength(1);
    const pb = html.match(/<div[^>]*role="progressbar"[^>]*>/)![0];
    expect(pb).toContain('aria-label="Loading Verilane"');
    expect(pb).toContain('aria-valuemin="0"');
    expect(pb).toContain('aria-valuemax="100"');
    expect(pb).toContain('aria-valuenow="10"');
    expect(pb).toContain('aria-valuetext="Opening workspace…"');
    expect(pb).not.toContain("aria-live");
  });

  it("starts the bar hidden and the sub-line empty", () => {
    expect(html).toContain('data-splash-bar="hidden"');
    expect(html).toContain("<span data-splash-msg>Verilane. Opening workspace…</span>");
    expect(html).toMatch(/<span class="splash-sub" data-splash-sub><\/span>/);
  });
});
