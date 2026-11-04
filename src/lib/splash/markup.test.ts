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

// TASK-45.5 (Design §5, §6, §18): the lighthouse scene, ported from the
// frozen mockup. Every scene and brand layer is decorative; the only
// accessible content stays the status, the progressbar and the button.
describe("splashMarkup · scene (45.5)", () => {
  const html = splashMarkup();
  const block = (cls: string) => {
    const i = html.indexOf(`class="${cls}"`);
    expect(i, cls).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", i), html.length);
  };

  it("draws the scene inside one aria-hidden layer: sky, two clouds, three hills, the rig", () => {
    expect(html).toMatch(/<div class="splash-scene" aria-hidden="true">/);
    const scene = block("splash-scene");
    const end = scene.indexOf('class="splash-brand"');
    const s = scene.slice(0, end);
    expect(s).toContain('class="splash-sky"');
    expect(s).toContain('class="splash-cloud splash-cloud-bg"');
    expect(s).toContain('class="splash-cloud splash-cloud-fg"');
    const hills = s.match(/<svg class="splash-hills"[^>]*>([\s\S]*?)<\/svg>/)!;
    expect(hills[0]).toContain('viewBox="0 0 1440 300"');
    expect(hills[0]).toContain('preserveAspectRatio="none"');
    expect((hills[1] ?? "").match(/<path /g)).toHaveLength(3);
    expect(s).toMatch(/<svg class="splash-tower" viewBox="0 0 100 400"/);
    expect(s).toContain('class="splash-glow"');
    expect(s).toContain('class="splash-beam-wide"');
    expect(s).toContain('class="splash-beam-core"');
  });

  it("splits the official logo into a V and a wordmark layer, both decorative", () => {
    expect(html).toMatch(/<div class="splash-brand" aria-hidden="true">/);
    const imgs = html.match(/<img [^>]*>/g)!;
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img).toContain('src="/brand/verilane-logo-light.png"');
      expect(img).toContain('alt=""');
    }
    expect(imgs[0]).toContain('class="splash-v"');
    expect(imgs[1]).toContain('class="splash-word"');
    // the sheen is masked by the same artwork, so it never leaves the V
    expect(html).toMatch(/<svg class="splash-sheen"[\s\S]*<image [^>]*data-href="\/brand\/verilane-logo-light.png"/);
    // ...but carries no href: an SVG <image> loads even while the overlay is
    // display:none, so the runtime sets href when the splash shows (EXE83)
    expect(html).not.toMatch(/<image [^>]*(?<!data-)href=/);
  });

  it("shows the tagline and both key hints (one is hidden per pointer type)", () => {
    expect(html).toContain('<p class="splash-tagline">AR Collections Copilot</p>');
    expect(html).toContain('<span class="splash-hint-key">or press any key</span>');
    expect(html).toContain('<span class="splash-hint-touch">or tap anywhere</span>');
  });

  it("keeps a single status, a single progressbar and the skip button outside the hidden layers", () => {
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html.match(/role="progressbar"/g)).toHaveLength(1);
    const hiddenEnd = html.indexOf('<div class="splash-progress">');
    expect(hiddenEnd).toBeGreaterThan(html.indexOf('class="splash-brand"'));
    expect(html.slice(0, hiddenEnd)).not.toMatch(/role=|<button/);
    expect(html.match(/<button /g)).toHaveLength(1);
  });

  it("references no url() or raster outside the logo (placeholder atmosphere only)", () => {
    expect(html).not.toMatch(/url\((?!#)/);
    const srcs = html.match(/(?:src|href)="([^"#][^"]*)"/g) ?? [];
    for (const s of srcs) expect(s).toContain("/brand/verilane-logo-light.png");
  });
});
