import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// TASK-45.5 · The lighthouse scene (TC-151–TC-156). Layout, parallax, theme
// independence, contrast and the Skip control are measured on the running
// overlay. Where a frame must be exact, the overlay's CSS animations are
// paused at a chosen time via getAnimations() (the runtime keeps its own
// clock; only the keyframed layers are frozen).

const FORCE = "?__splash=1";

async function splashOn(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
      if (window.sessionStorage.getItem("e2e:splash-reset") === null) {
        window.sessionStorage.removeItem("verilane-splash-seen");
        window.sessionStorage.setItem("e2e:splash-reset", "1");
      }
    } catch {
      // Storage blocked: the splash stays off, and the spec fails loudly.
    }
  });
}

/** Hold the seed manifest so the overlay stays up (on, then hold) for `ms`. */
async function holdManifest(context: BrowserContext, ms: number) {
  await context.route("**/seed/manifest.json", async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue().catch(() => {});
  });
}

async function waitPastT0(page: Page, ms: number) {
  await page.waitForFunction((target) => {
    const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime;
    return t0 !== undefined && performance.now() - t0 >= target;
  }, ms);
}
const waitForSplash = (page: Page, state: string, timeout?: number) =>
  page.waitForFunction((s) => document.documentElement.dataset.splash === s, state, { timeout });

/** Open the splash and wait until its logo layers have decoded. */
async function openSplash(page: Page) {
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitPastT0(page, 0);
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>("#verilane-splash img")].every((i) => i.complete && i.naturalWidth > 0),
  );
}

/** Pause every CSS animation in the overlay; with `at`, seek each to that
 * time since t0 (all intro layers start at t0, so this is the frame at `at`). */
async function freeze(page: Page, at?: number) {
  return page.evaluate((t) => {
    const o = document.getElementById("verilane-splash")!;
    const anims = document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return target instanceof Element && o.contains(target);
    });
    for (const a of anims) {
      if (a instanceof CSSAnimation) {
        a.pause();
        if (t !== null) a.currentTime = t;
      } else a.finish();
    }
    return anims.filter((a) => a instanceof CSSAnimation).map((a) => (a as CSSAnimation).animationName);
  }, at ?? null);
}

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const rect = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

type RGB = [number, number, number];
/** Decode a viewport screenshot once; px() reads one CSS pixel. */
async function pixels(page: Page) {
  const buf = await page.screenshot({ animations: "allow", caret: "initial" });
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const vw = page.viewportSize()!.width;
  const s = info.width / vw;
  const px = (x: number, y: number): RGB => {
    const i = (Math.round(y * s) * info.width + Math.round(x * s)) * 3;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  /** The brightest pixel inside a rect (the worst background for light text). */
  const brightest = (r: Rect): RGB => {
    let best: RGB = [0, 0, 0];
    for (let y = Math.ceil(r.top); y < r.bottom; y++)
      for (let x = Math.ceil(r.left); x < r.right; x++) {
        const p = px(x, y);
        if (lum(p) > lum(best)) best = p;
      }
    return best;
  };
  return { buf, data, info, px, brightest };
}
const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const parseRgb = (css: string): RGB => {
  const m = css.match(/[\d.]+/g)!.map(Number);
  return [m[0]!, m[1]!, m[2]!];
};
const hex = (p: RGB) => `#${p.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

test.beforeEach(async ({ context }) => {
  await splashOn(context);
});

test("TC-151: the scene fits at 375 / 768 / 1440 without horizontal scroll", async ({ context }) => {
  test.slow();
  const viewports = [
    { name: "375 portrait", width: 375, height: 812 },
    { name: "375 landscape", width: 812, height: 375 },
    { name: "768", width: 768, height: 1024 },
    { name: "1440", width: 1440, height: 900 },
  ];
  for (const vp of viewports) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openSplash(page);
    await page.waitForFunction(
      () => document.querySelector("#verilane-splash [data-splash-bar]")?.getAttribute("data-splash-bar") === "shown",
      undefined,
      { timeout: 10_000 },
    );
    await freeze(page, 4000);
    const scroll = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      w: window.innerWidth,
    }));
    expect(scroll.doc, `${vp.name}: document scrollWidth`).toBeLessThanOrEqual(scroll.w);
    expect(scroll.body, `${vp.name}: body scrollWidth`).toBeLessThanOrEqual(scroll.w);
    const at = (s: string) => rect(page, `#verilane-splash ${s}`);
    const [logo, brand, tower, track, skip, hint] = await Promise.all([
      at(".splash-logo"),
      at(".splash-brand"),
      at(".splash-tower"),
      at(".splash-track"),
      at("[data-splash-skip]"),
      at(".splash-hint"),
    ]);
    for (const [what, r] of Object.entries({ logo, tower, track, skip, hint })) {
      expect(r.left, `${vp.name}: ${what} left`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${vp.name}: ${what} right`).toBeLessThanOrEqual(vp.width);
      expect(r.top, `${vp.name}: ${what} top`).toBeGreaterThanOrEqual(0);
      expect(r.bottom, `${vp.name}: ${what} bottom`).toBeLessThanOrEqual(vp.height);
    }
    // the bar sits on the wordmark's axis (Design §12)
    const barMid = (track.left + track.right) / 2;
    const logoMid = (logo.left + logo.right) / 2;
    expect(Math.abs(barMid - logoMid), `${vp.name}: bar centre ${barMid} vs wordmark ${logoMid}`).toBeLessThanOrEqual(2);
    if (vp.width <= 600) expect(Math.abs(barMid - vp.width / 2), `${vp.name}: bar centred`).toBeLessThanOrEqual(2);
    // the skip control clears the bar and the wordmark; the bar clears the lockup
    expect(overlaps(skip, track), `${vp.name}: skip over bar`).toBe(false);
    expect(overlaps(skip, logo), `${vp.name}: skip over wordmark`).toBe(false);
    expect(overlaps(hint, track), `${vp.name}: hint over bar`).toBe(false);
    expect(overlaps(brand, track), `${vp.name}: bar over the lockup`).toBe(false);
    await page.close();
  }
});

for (const vp of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
]) {
  test(`TC-152: cloud parallax at ${vp.width}: the foreground drifts twice as far as the background`, async ({ page }) => {
    // Both clouds show only above 600 px (the background cloud is hidden on phones).
    await page.setViewportSize(vp);
    await openSplash(page);
    const names = await freeze(page, 5000);
    expect(names).toEqual(expect.arrayContaining(["splash-drift-bg", "splash-drift-fg"]));
    const dx = await page.evaluate(() => {
      const tx = (s: string) => new DOMMatrix(getComputedStyle(document.querySelector(s)!).transform).m41;
      return { bg: tx("#verilane-splash .splash-cloud-bg"), fg: tx("#verilane-splash .splash-cloud-fg"), vw: window.innerWidth / 100 };
    });
    test.info().annotations.push({ type: "TC-152", description: `${vp.width}: fg ${dx.fg.toFixed(2)} px, bg ${dx.bg.toFixed(2)} px, 1vw ${dx.vw} px` });
    expect(Math.abs(dx.fg - 5 * dx.vw), "foreground ≈ 5vw").toBeLessThanOrEqual(1);
    expect(Math.abs(dx.bg - 2.5 * dx.vw), "background ≈ 2.5vw").toBeLessThanOrEqual(1);
    expect(Math.abs(dx.fg / dx.bg - 2)).toBeLessThanOrEqual(0.1);
  });
}

test("TC-153: the overlay is the same in light and dark, and exits into the app's theme with no white flash", async ({ browser, baseURL }) => {
  test.slow();
  const shots: Record<string, Buffer> = {};
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ baseURL, colorScheme: scheme, viewport: { width: 1440, height: 900 } });
    await splashOn(ctx);
    await holdManifest(ctx, 15_000);
    const page = await ctx.newPage();
    await openSplash(page);
    // the same runtime state in both: seeding (80 %), revealed, stalled
    await page.waitForFunction(
      () => {
        const bar = document.querySelector("#verilane-splash [data-splash-bar]");
        const pb = document.querySelector("#verilane-splash [role=progressbar]");
        return bar?.getAttribute("data-splash-bar") === "shown" && bar.hasAttribute("data-stalled") && pb?.getAttribute("aria-valuenow") === "80";
      },
      undefined,
      { timeout: 10_000 },
    );
    await freeze(page, 4000);
    shots[scheme] = await page.screenshot({ animations: "allow", caret: "initial" });
    await ctx.close();
  }
  const [a, b] = await Promise.all(
    [shots.light!, shots.dark!].map((s) => sharp(s).removeAlpha().raw().toBuffer()),
  );
  expect(a!.length).toBe(b!.length);
  let diff = 0;
  for (let i = 0; i < a!.length; i++) if (Math.abs(a![i]! - b![i]!) > 2) diff++;
  expect(diff, "overlay pixels that differ between light and dark").toBe(0);

  // The exit: every frame's app backdrop is the app theme (never a white
  // canvas in dark), and the first frame after done is the themed app.
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ baseURL, colorScheme: scheme, viewport: { width: 1440, height: 900 } });
    await splashOn(ctx);
    const page = await ctx.newPage();
    await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
    await waitPastT0(page, 0);
    const frames = await page.evaluate(
      () =>
        new Promise<{ op: number; bg: string; app: string }[]>((resolve) => {
          const out: { op: number; bg: string; app: string }[] = [];
          const backdrop = () => {
            for (const el of [document.body, document.documentElement]) {
              const c = getComputedStyle(el).backgroundColor;
              if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
            }
            return "canvas";
          };
          const tick = () => {
            const s = document.documentElement.dataset.splash;
            const o = document.getElementById("verilane-splash");
            if (s === "exit" || s === "done")
              out.push({ op: o ? Number(getComputedStyle(o).opacity) : 0, bg: backdrop(), app: getComputedStyle(document.body).colorScheme });
            if (s === "done") return resolve(out);
            requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    expect(frames.length, `${scheme}: exit frames sampled`).toBeGreaterThan(1);
    const bgs = [...new Set(frames.map((f) => f.bg))];
    expect(bgs, `${scheme}: one backdrop through the exit`).toHaveLength(1);
    expect(bgs[0], `${scheme}: backdrop is an explicit colour`).not.toBe("canvas");
    const bgL = lum(parseRgb(bgs[0]!));
    if (scheme === "dark") expect(bgL, "dark backdrop").toBeLessThan(0.05);
    else expect(bgL, "light backdrop").toBeGreaterThan(0.8);
    // the first frame after done
    const after = await sharp(await page.screenshot()).greyscale().stats();
    const mean = after.channels[0]!.mean / 255;
    test.info().annotations.push({ type: "TC-153", description: `${scheme}: backdrop ${bgs[0]} · first frame after done mean ${mean.toFixed(3)} · ${frames.length} exit frames` });
    if (scheme === "dark") expect(mean, "dark app after done").toBeLessThan(0.3);
    else expect(mean, "light app after done").toBeGreaterThan(0.6);
    await ctx.close();
  }
});

for (const beat of [
  { name: "reveal", hold: false },
  { name: "hold", hold: true },
]) {
  test(`TC-154: bar fill ≥ 3:1 and text ≥ 4.5:1 against the scene at ${beat.name}`, async ({ page, context }) => {
    test.slow();
    await page.setViewportSize({ width: 1440, height: 900 });
    if (beat.hold) await holdManifest(context, 15_000);
    await openSplash(page);
    await page.waitForFunction(
      () => document.querySelector("#verilane-splash [data-splash-bar]")?.getAttribute("data-splash-bar") === "shown",
      undefined,
      { timeout: 10_000 },
    );
    if (beat.hold) {
      await waitForSplash(page, "hold", 10_000);
      await freeze(page);
    } else await freeze(page, 3600);
    // the bar reveal transition has finished: the fill is fully opaque
    const [track, fill] = await Promise.all([rect(page, "#verilane-splash .splash-track"), rect(page, "#verilane-splash .splash-fill")]);
    const shot = await pixels(page);
    const y = (track.top + track.bottom) / 2;
    const above = track.top - 5;
    const start = shot.px(fill.left + 4, y);
    const end = shot.px(fill.right - 4, y);
    const startBg = shot.px(fill.left + 4, above);
    const endBg = shot.px(fill.right - 4, above);
    // text: hide the glyphs, then the brightest pixel behind them is the worst background
    const sel = { status: "#verilane-splash .splash-status", skip: "#verilane-splash [data-splash-skip]", hint: "#verilane-splash .splash-hint" };
    const colours = await page.evaluate((s) => {
      const c = (q: string) => getComputedStyle(document.querySelector(q)!).color;
      const out = { status: c(`${s.status} [data-splash-msg]`), skip: c(s.skip), hint: c(`${s.hint} span`) };
      for (const q of [s.status, s.skip, s.hint]) {
        const el = document.querySelector<HTMLElement>(q)!;
        el.style.setProperty("color", "transparent", "important");
        el.querySelectorAll<HTMLElement>("*").forEach((k) => k.style.setProperty("color", "transparent", "important"));
      }
      return out;
    }, sel);
    const [status, skip, hint] = await Promise.all([rect(page, `${sel.status} [data-splash-msg]`), rect(page, sel.skip), rect(page, `${sel.hint} span`)]);
    const blank = await pixels(page);
    // inside the pill, clear of its 1 px border (the pill is inset 4 px top and bottom)
    const skipInner = { ...skip, left: skip.left + 8, right: skip.right - 8, top: skip.top + 8, bottom: skip.bottom - 8 };
    const res = {
      fillStart: ratio(start, startBg),
      fillEnd: ratio(end, endBg),
      status: ratio(parseRgb(colours.status), blank.brightest(status)),
      skip: ratio(parseRgb(colours.skip), blank.brightest(skipInner)),
      hint: ratio(parseRgb(colours.hint), blank.brightest(hint)),
    };
    test.info().annotations.push({
      type: "TC-154",
      description: `${beat.name}: fill start ${hex(start)} on ${hex(startBg)} ${res.fillStart.toFixed(2)} · fill end ${hex(end)} on ${hex(endBg)} ${res.fillEnd.toFixed(2)} · status ${res.status.toFixed(2)} · skip ${res.skip.toFixed(2)} · hint ${res.hint.toFixed(2)}`,
    });
    expect(res.fillStart, "fill start").toBeGreaterThanOrEqual(3);
    expect(res.fillEnd, "fill end").toBeGreaterThanOrEqual(3);
    expect(res.status, "status text").toBeGreaterThanOrEqual(4.5);
    expect(res.skip, "skip label").toBeGreaterThanOrEqual(4.5);
    expect(res.hint, "key hint").toBeGreaterThanOrEqual(4.5);
  });
}

test.describe("TC-155: the Skip intro button", () => {
  async function check(page: Page, coarse: boolean) {
    await openSplash(page);
    await waitPastT0(page, 400);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
    // no autofocus
    expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(true);
    const btn = page.locator("#verilane-splash [data-splash-skip]");
    const box = (await btn.boundingBox())!;
    expect(box.width, "target width").toBeGreaterThanOrEqual(44);
    expect(box.height, "target height").toBeGreaterThanOrEqual(44);
    // bottom-right placement
    const vp = page.viewportSize()!;
    expect(box.x + box.width).toBeGreaterThan(vp.width - 80);
    expect(box.y + box.height).toBeGreaterThan(vp.height - 120);
    // the hint follows the pointer type
    await expect(page.locator("#verilane-splash .splash-hint-key")).toBeVisible({ visible: !coarse });
    await expect(page.locator("#verilane-splash .splash-hint-touch")).toBeVisible({ visible: coarse });
    const pill = await btn.evaluate((el) => {
      const b = getComputedStyle(el, "::before");
      return { top: b.top, bottom: b.bottom };
    });
    expect(pill).toEqual(coarse ? { top: "0px", bottom: "0px" } : { top: "4px", bottom: "4px" });
    return btn;
  }

  test("fine pointer: 44 × 44 target, no autofocus, the first Tab focuses Skip with a visible ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const btn = await check(page, false);
    await page.keyboard.press("Tab");
    await expect(btn).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.dataset.splash), "Tab moves focus, it does not skip").toMatch(/^(on|hold)$/);
    const ring = await btn.evaluate((el) => {
      const b = getComputedStyle(el, "::before");
      return { visible: el.matches(":focus-visible"), style: b.outlineStyle, width: b.outlineWidth, color: b.outlineColor };
    });
    expect(ring).toEqual({ visible: true, style: "solid", width: "2px", color: "rgb(142, 215, 176)" });
    // EXE79: a real Shift+Tab (Shift keydown, then Tab) moves focus back and
    // does not skip; focus never lands in the inert app behind the overlay.
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.documentElement.dataset.splash), "Shift+Tab does not skip").toMatch(/^(on|hold)$/);
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      return !a || a === document.body ? "body" : a.closest("#verilane-splash") ? "overlay" : "app:" + a.tagName;
    });
    expect(["body", "overlay"], "focus after Shift+Tab").toContain(where);
    await page.keyboard.press("Tab");
    await expect(btn, "Tab returns to Skip").toBeFocused();
  });

  test.describe("coarse pointer", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    test("coarse pointer: the pill fills the 44 px target and the hint reads 'or tap anywhere'", async ({ page }) => {
      await check(page, true);
    });
  });
});

// EXE83: an SVG <image> loads even inside the display:none overlay, so the
// sheen mask gets its href only when the splash shows. The app's own logo goes
// through /_next/image, so a raw request for the file is the splash's alone.
test("EXE83: the splash logo is not fetched on a load where the splash does not show", async ({ browser, baseURL }) => {
  const LOGO = "/brand/verilane-logo-light.png";
  async function load(show: boolean) {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((seen) => {
      try {
        window.localStorage.setItem("verilane-session", "guest");
        if (seen) window.sessionStorage.setItem("verilane-splash-seen", "1");
        else if (window.sessionStorage.getItem("e2e:splash-reset") === null) {
          window.sessionStorage.removeItem("verilane-splash-seen");
          window.sessionStorage.setItem("e2e:splash-reset", "1");
        }
      } catch {
        // Storage blocked: the assertions below fail loudly.
      }
    }, !show);
    const page = await ctx.newPage();
    const hits: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === LOGO) hits.push(r.url());
    });
    await page.goto(show ? `/queue${FORCE}` : "/queue", { waitUntil: "load" });
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      splash: document.documentElement.dataset.splash ?? "none",
      href: document.querySelector("#verilane-splash .splash-sheen image")?.getAttribute("href") ?? null,
    }));
    await ctx.close();
    return { hits, ...state };
  }
  const off = await load(false);
  expect(off.splash, "the splash does not show").toMatch(/^(none|done)$/);
  expect(off.href, "no href on the hidden sheen").toBeNull();
  expect(off.hits, "no logo request").toEqual([]);
  // control: the same check sees the request when the splash shows
  const on = await load(true);
  expect(on.splash).toMatch(/^(on|hold|exit|done)$/);
  expect(on.href).toBe(LOGO);
  expect(on.hits.length, "the logo is fetched when the splash shows").toBeGreaterThan(0);
});

// TC-156: frame captures for the human look-check. They write to the
// scratch directory in SPLASH_SHOTS, so a normal run skips them.
const SHOTS = process.env.SPLASH_SHOTS;
test.describe("TC-156: frame captures", () => {
  test.skip(!SHOTS, "set SPLASH_SHOTS to a directory to capture frames");
  test.skip(({ colorScheme }) => colorScheme !== "light", "captured once; TC-153 proves the themes match");

  const sizes = [
    { w: 1440, h: 900 },
    { w: 768, h: 1024 },
    { w: 375, h: 812 },
  ];
  /** fNN beats: the design's frame numbers, read off the mockup frames. */
  const beats = [
    { name: "f02", at: 900 },
    { name: "f04", at: 2000 },
    { name: "f06", at: 3150 },
  ];
  for (const s of sizes) {
    test(`TC-156 frames at ${s.w}`, async ({ context }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS!, { recursive: true });
      const out = (n: string) => join(SHOTS!, `${s.w}-${n}.png`);
      await holdManifest(context, 15_000);
      for (const b of beats) {
        const page = await context.newPage();
        await page.setViewportSize({ width: s.w, height: s.h });
        await openSplash(page);
        await freeze(page, b.at);
        await page.screenshot({ path: out(b.name), animations: "allow", caret: "initial" });
        await page.close();
      }
      // f07: the bar block is up (revealed by the runtime at 3.2 s)
      {
        const page = await context.newPage();
        await page.setViewportSize({ width: s.w, height: s.h });
        await openSplash(page);
        await page.waitForFunction(() => document.querySelector("#verilane-splash [data-splash-bar]")?.getAttribute("data-splash-bar") === "shown");
        await freeze(page, 4000);
        await page.screenshot({ path: out("f07-bar"), animations: "allow", caret: "initial" });
        await page.close();
      }
      // hold with the stall line (after D + 1.5 s), then just before the ceiling
      {
        const page = await context.newPage();
        await page.setViewportSize({ width: s.w, height: s.h });
        await openSplash(page);
        await waitPastT0(page, 7500);
        await freeze(page);
        await page.screenshot({ path: out("hold-stall"), animations: "allow", caret: "initial" });
        await page.close();
      }
      {
        const page = await context.newPage();
        await page.setViewportSize({ width: s.w, height: s.h });
        await openSplash(page);
        await waitPastT0(page, 9300);
        await freeze(page);
        await page.screenshot({ path: out("ceiling-hold"), animations: "allow", caret: "initial" });
        await page.close();
      }
    });

    test(`TC-156 exits at ${s.w}`, async ({ browser, baseURL }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS!, { recursive: true });
      const out = (n: string) => join(SHOTS!, `${s.w}-${n}.png`);
      const cases: { name: string; setup: (c: BrowserContext) => Promise<unknown> }[] = [
        { name: "ready-exited", setup: async () => {} },
        { name: "error-exited", setup: (c) => c.route("**/seed/manifest.json", (r) => r.abort()) },
        {
          name: "ceiling-exited",
          setup: (c) =>
            c.route("**/_next/static/chunks/*.js", async (route) => {
              const res = await route.fetch();
              const body = await res.text();
              if (body.includes("failed to open database")) await route.abort();
              else await route.fulfill({ response: res, body });
            }),
        },
      ];
      for (const k of cases) {
        const ctx = await browser.newContext({ baseURL, colorScheme: "light", viewport: { width: s.w, height: s.h } });
        await splashOn(ctx);
        await k.setup(ctx);
        const page = await ctx.newPage();
        await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
        await waitForSplash(page, "done", 25_000);
        await page.waitForTimeout(500);
        await page.screenshot({ path: out(k.name) });
        await ctx.close();
      }
    });

    // TASK-45.6: the reduced-motion static frame (bar up from t0) and the
    // same frame once the stall line shows (D_rm + 1.5 s = 2.5 s).
    test(`TC-156 reduced motion at ${s.w}`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      mkdirSync(SHOTS!, { recursive: true });
      const out = (n: string) => join(SHOTS!, `${s.w}-${n}.png`);
      const ctx = await browser.newContext({
        baseURL,
        colorScheme: "light",
        reducedMotion: "reduce",
        viewport: { width: s.w, height: s.h },
      });
      await splashOn(ctx);
      await holdManifest(ctx, 15_000);
      for (const f of [
        { name: "rm", at: 600 },
        { name: "rm-stall", at: 2700 },
      ]) {
        const page = await ctx.newPage();
        await openSplash(page);
        await waitPastT0(page, f.at);
        await page.screenshot({ path: out(f.name), caret: "initial" });
        await page.close();
      }
      await ctx.close();
    });
  }
});
