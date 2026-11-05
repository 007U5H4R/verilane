import { test, expect, type Browser, type Page, type Request } from "@playwright/test";

// TASK-46.2 · Tracer: placeholder heritage art behind the AppShell column,
// served through `image-set()` in globals.css (production build).
// TC-092/093 kill R5 (url() rewriting + immutable caching), TC-094 kills R5b
// (sw.js STATIC_REF keeps the asset), TC-095/096 prove theme selection is pure
// CSS (no wrong-theme request, no transition), TC-097/098 prove the band never
// covers overlays or eats clicks (R7, SC3).

// Matches both `url(x)` and the bare-string `"x"` form Lightning CSS emits inside image-set().
const HERITAGE_URL = /(?:url\(\s*["']?|["'])([^"')\s]*heritage-[^"')\s]*\.(?:avif|webp))/g;

async function ready(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

/** Every stylesheet the page links, as served. */
async function stylesheets(page: Page): Promise<{ href: string; text: string }[]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (l) => l.href),
  );
  return Promise.all(
    hrefs.map(async (href) => {
      const res = await page.request.get(href);
      expect(res.ok(), href).toBe(true);
      return { href, text: await res.text() };
    }),
  );
}

/** Heritage url() references: as written in the CSS, and resolved against the sheet. */
async function heritageRefs(page: Page): Promise<{ raw: string; url: URL; sheet: string }[]> {
  const refs: { raw: string; url: URL; sheet: string }[] = [];
  for (const { href, text } of await stylesheets(page)) {
    for (const m of text.matchAll(HERITAGE_URL)) refs.push({ raw: m[1]!, url: new URL(m[1]!, href), sheet: text });
  }
  return refs;
}

async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await ready(page);
}

// TASK-46.4: the idle preload adds the other theme's image after [data-idle].
// To tell first-paint requests from idle ones, an init script stamps when
// data-idle first appears (epoch ms, the page's clock), and each request's
// start comes from the browser's network timing on the same clock. Resource
// Timing is not used: the shell remounts the layer twice after the splash,
// and Chromium then drops entries for the art at random (measured, EXE61).
type IdleWindow = Window & { __heritageIdleAt?: number };

function trackHeritageIdle(): void {
  const w = window as IdleWindow;
  new MutationObserver(() => {
    if (w.__heritageIdleAt === undefined && document.querySelector("[data-heritage][data-idle]")) {
      w.__heritageIdleAt = performance.timeOrigin + performance.now();
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-idle"] });
}

/** Collects every heritage request the page sends from now on. */
function watchHeritage(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (/heritage-/.test(r.url())) seen.push(r);
  });
  return seen;
}

/**
 * Heritage requests (pathnames) split at the moment data-idle first appeared;
 * idleAt null = never. A request whose start is unknown counts as first paint,
 * so an unmeasurable request can only fail the "nothing extra on first paint"
 * checks, never pass them.
 */
async function heritageTimeline(page: Page, seen: Request[]): Promise<{ idleAt: number | null; beforeIdle: string[]; afterIdle: string[] }> {
  const idleAt = await page.evaluate(() => (window as IdleWindow).__heritageIdleAt ?? null);
  const entries = await Promise.all(
    seen.map(async (r) => {
      await r.response().catch(() => null);
      return { path: new URL(r.url()).pathname, start: r.timing().startTime };
    }),
  );
  const after = (e: { start: number }) => idleAt !== null && e.start > 0 && e.start >= idleAt;
  return {
    idleAt,
    beforeIdle: entries.filter((e) => !after(e)).map((e) => e.path),
    afterIdle: entries.filter(after).map((e) => e.path),
  };
}

test("TC-092: emitted CSS carries versioned heritage URLs with type() hints in both image-set entries", async ({ page }) => {
  await openHome(page);
  const refs = await heritageRefs(page);
  for (const theme of ["light", "dark"]) {
    for (const [ext, mime] of [
      ["avif", "image/avif"],
      ["webp", "image/webp"],
    ] as const) {
      const hits = refs.filter((r) => r.url.pathname.includes(`heritage-${theme}-desk`) && r.url.pathname.endsWith(`.${ext}`));
      expect(hits.length, `${theme} desk .${ext} referenced`).toBeGreaterThan(0);
      for (const hit of hits) {
        // Path B (EXE55): Turbopack leaves url() inside image-set() unrewritten, so
        // the art is served from public/ under a versioned name.
        expect(hit.url.pathname).toMatch(new RegExp(`^/heritage/heritage-${theme}-desk\\.v\\d+\\.${ext}$`));
        // The type() hint survives right after this url() entry.
        const escaped = hit.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(hit.sheet).toMatch(
          new RegExp(`${escaped}["']?\\)?\\s*(?:\\d+(?:\\.\\d+)?x\\s*)?type\\(\\s*["']?${mime}["']?\\s*\\)`),
        );
      }
    }
  }
  for (const ref of refs) {
    const res = await page.request.get(ref.url.href);
    expect(res.status(), ref.url.pathname).toBe(200);
  }
});

test("TC-093: heritage assets are served immutable for a year", async ({ page }) => {
  await openHome(page);
  const refs = await heritageRefs(page);
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs) {
    const res = await page.request.get(ref.url.href);
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc, ref.url.pathname).toContain("max-age=31536000");
    expect(cc, ref.url.pathname).toContain("immutable");
  }
});

test("TC-094: sw.js pruneStatics can never drop the heritage art (R5b)", async ({ page }) => {
  // Path B (EXE55): the art sits outside /_next/static/, which is the only key
  // space pruneStatics() manages, so STATIC_REF need not match it. The flip side
  // (the SW does not cache /heritage/ at all, so no offline art) is TASK-46.8's.
  await openHome(page);
  const sw = await (await page.request.get("/sw.js")).text();
  expect(sw, "pruneStatics still scopes itself to /_next/static/").toContain('if (pathname.startsWith("/_next/static/")) statics.set(pathname, request);');
  const refs = await heritageRefs(page);
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs) {
    expect(ref.url.origin, `emitted form: ${ref.raw}`).toBe(new URL(page.url()).origin);
    expect(ref.url.pathname.startsWith("/_next/static/"), `emitted form: ${ref.raw}`).toBe(false);
  }
});

async function firstHeritageRequest(
  browser: Browser,
  baseURL: string,
  opts: { colorScheme: "light" | "dark"; stored?: "dark" },
): Promise<{ seen: string[]; beforeIdle: string[] }> {
  const context = await browser.newContext({ baseURL, colorScheme: opts.colorScheme, serviceWorkers: "block" });
  await context.addInitScript(trackHeritageIdle);
  if (opts.stored) {
    const stored = opts.stored;
    await context.addInitScript((t) => localStorage.setItem("verilane-theme", t), stored);
  }
  const page = await context.newPage();
  const watched = watchHeritage(page);
  await openHome(page);
  await expect.poll(() => watched.length).toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");
  const { beforeIdle } = await heritageTimeline(page, watched);
  await context.close();
  return { seen: watched.map((r) => r.url()), beforeIdle };
}

test("TC-095: the first heritage request matches the theme (light, stored dark, system dark)", async ({ browser, baseURL }) => {
  const cases = [
    { opts: { colorScheme: "light" as const }, stem: "heritage-light-", other: "heritage-dark-" },
    { opts: { colorScheme: "light" as const, stored: "dark" as const }, stem: "heritage-dark-", other: "heritage-light-" },
    { opts: { colorScheme: "dark" as const }, stem: "heritage-dark-", other: "heritage-light-" },
  ];
  for (const c of cases) {
    const { seen, beforeIdle } = await firstHeritageRequest(browser, baseURL!, c.opts);
    expect(seen[0], JSON.stringify(c.opts)).toContain(c.stem);
    // The other theme may only arrive with the idle preload (TASK-46.4, TC-106b), never on first paint.
    expect(beforeIdle.length, JSON.stringify(c.opts)).toBeGreaterThan(0);
    expect(beforeIdle.filter((u) => u.includes(c.other)), JSON.stringify(c.opts)).toEqual([]);
  }
});

test("TC-096: the theme toggle swaps the art in the same frame, with no transition", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openHome(page);
  const before = await page.locator("[data-heritage]").evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(before).toContain("heritage-light-");
  const after = await page.evaluate(
    () =>
      new Promise<{ bg: string; transition: string }>((resolve) => {
        document.querySelector<HTMLButtonElement>('button[aria-label="Toggle dark theme"]')!.click();
        requestAnimationFrame(() => {
          const s = getComputedStyle(document.querySelector("[data-heritage]")!);
          resolve({ bg: s.backgroundImage, transition: s.transitionDuration });
        });
      }),
  );
  expect(after.bg).toContain("heritage-dark-");
  expect(after.transition).toBe("0s");
});

type Box = { x: number; y: number; width: number; height: number };

/** The element at `box`'s centre, checked to be inside `selector`, and the centre to lie over the band. */
async function hitAtCentre(page: Page, box: Box, selector: string) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return page.evaluate(
    ({ cx, cy, selector }) => {
      const hit = document.elementFromPoint(cx, cy);
      const band = document.querySelector("[data-heritage]")!.getBoundingClientRect();
      return {
        inside: !!hit?.closest(selector),
        overBand: cx >= band.left && cx <= band.right && cy >= band.top && cy <= band.bottom,
        tag: hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : "null",
      };
    },
    { cx, cy, selector },
  );
}

test("TC-097: menus, dialogs and tooltips stay above the art (R7)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await openHome(page);
  await page.getByRole("button", { name: "AR, Account" }).click();
  const panel = page.locator("#account-panel");
  await expect(panel).toBeVisible();
  const menu = await hitAtCentre(page, (await panel.boundingBox())!, "#account-panel");
  expect(menu).toMatchObject({ inside: true, overBand: true });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  // F-1: the grid column eases 272px → 72px over 200ms. Hovering mid-transition
  // measured the band while its left edge was still past the tooltip, so wait
  // for the collapsed rail width before measuring anything.
  await expect.poll(() => page.locator("[data-heritage]").evaluate((el) => el.getBoundingClientRect().left)).toBe(72);
  await page.locator('a[href="/disputes"][aria-label]').first().hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("Disputes");
  // Radix renders the role=tooltip node visually hidden inside the visible content.
  const content = page.locator("[data-radix-popper-content-wrapper]").first();
  const tooltip = await hitAtCentre(page, (await content.boundingBox())!, "[data-radix-popper-content-wrapper]");
  expect(tooltip).toMatchObject({ inside: true, overBand: true });
  await page.mouse.move(800, 600, { steps: 8 });

  await page.goto("/settings");
  await ready(page);
  await page.locator("#reset").getByRole("button", { name: "Reset demo data" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reset workspace demo data?" });
  await expect(dialog).toBeVisible();
  // Opening #reset scrolled the band away; bring it back under the fixed dialog.
  await page.locator("[data-heritage]").evaluate((el) => el.scrollIntoView({ block: "start" }));
  const alert = await hitAtCentre(page, (await dialog.boundingBox())!, '[role="alertdialog"]');
  expect(alert).toMatchObject({ inside: true, overBand: true });
});

test("TC-098: clicks pass through the art to the control underneath (SC3)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  const target = await page.evaluate(() => {
    const band = document.querySelector("[data-heritage]")!.getBoundingClientRect();
    for (const a of document.querySelectorAll<HTMLAnchorElement>('main a[href^="/"]')) {
      const r = a.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (r.width === 0 || cy < band.top || cy > band.bottom || cx < band.left || cx > band.right) continue;
      const hit = document.elementFromPoint(cx, cy);
      return {
        href: a.getAttribute("href")!,
        cx,
        cy,
        hitIsHeritage: !!hit?.closest("[data-heritage]"),
        hitInsideLink: !!hit && a.contains(hit),
      };
    }
    return null;
  });
  expect(target, "a main link over the band").not.toBeNull();
  expect(target!.hitIsHeritage).toBe(false);
  expect(target!.hitInsideLink).toBe(true);
  await page.mouse.click(target!.cx, target!.cy);
  await expect(page).toHaveURL((u) => u.pathname + u.search === target!.href);
});

// R-1 scar (EXE57): `isolate` on the content column caps every fixed overlay
// rendered inside it at the column's level. The bottom tabs (fixed z-40) must
// live inside that column too, or below 768px they paint over side panels,
// drawers and the tour's backdrop, and take the taps meant for them.
test("TC-097b: shell overlays paint above bottom tabs at 375 (R-1)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  /** What a tap at the centre of the first non-current bottom tab lands on. */
  const bottomHit = () =>
    page.evaluate(() => {
      const target = document.querySelector<HTMLAnchorElement>('nav[aria-label="Mobile"] a[href]:not([aria-current="page"])')!;
      const r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        cx,
        cy,
        // The tab bar is pinned to the viewport's bottom edge, whatever its height.
        atBottom: target.closest("nav")!.getBoundingClientRect().bottom === window.innerHeight && r.bottom <= window.innerHeight,
        target: target.getAttribute("href"),
        inDialog: !!hit?.closest('[role="dialog"]'),
        inNav: !!hit?.closest('nav[aria-label="Mobile"]'),
        href: hit?.closest("a")?.getAttribute("href") ?? null,
      };
    });

  // Nothing open: the tab under that point takes the tap and navigates.
  await openHome(page);
  const tab = await bottomHit();
  expect(tab).toMatchObject({ atBottom: true, inDialog: false, inNav: true, href: tab.target });
  expect(tab.href).toMatch(/^\/\w+$/);
  await page.mouse.click(tab.cx, tab.cy);
  await expect(page).toHaveURL((u) => u.pathname === tab.href);

  // The disputes Filters side panel.
  await page.goto("/disputes");
  await ready(page);
  await page.getByRole("button", { name: /^Filter disputes/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await bottomHit()).toMatchObject({ inDialog: true, inNav: false });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  {
    const h = await bottomHit();
    expect(h).toMatchObject({ inDialog: false, inNav: true, href: h.target });
  }

  // A drawer rendered inside <main>: the audit detail drawer (a role switch
  // gives a fresh profile its one audit row).
  await page.goto("/audit");
  await ready(page);
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Manager" }).click();
  await expect(page.getByTestId("audit-row")).toHaveCount(1);
  await page.getByTestId("audit-row").first().getByRole("button", { name: /^View details/ }).click();
  await expect(page.getByTestId("audit-drawer")).toBeVisible();
  expect(await bottomHit()).toMatchObject({ inDialog: true, inNav: false });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("audit-drawer")).toHaveCount(0);

  // The tour's backdrop: its confirm card dims the whole screen, More tab included.
  // (The running tour's spotlight is pointer-events: none by design, and its
  // ring deliberately leaves the More tab tappable; see demo-tour.spec.)
  await page.getByTestId("demo-button").click();
  await expect(page.getByTestId("tour-confirm")).toBeVisible();
  const more = await page.evaluate(() => {
    const el = document.querySelector("[data-tour=nav-more]")!;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { inNav: !!hit?.closest('nav[aria-label="Mobile"]'), inBackdrop: !!hit?.closest("[data-tour-ui]") };
  });
  expect(more).toEqual({ inNav: false, inBackdrop: true });
  await page.getByTestId("tour-confirm").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("tour-confirm")).toHaveCount(0);
  {
    const h = await bottomHit();
    expect(h).toMatchObject({ inDialog: false, inNav: true, href: h.target });
  }
});

// TASK-46.3 · Route levels, responsive, forced colors, print, switch-off.

type Load = {
  url: string;
  viewport?: { width: number; height: number };
  media?: Parameters<Page["emulateMedia"]>[0];
  /** Extra wait after networkidle, e.g. past the 4 s idle timeout (TC-103). */
  settleMs?: number;
  /** Wait for data-idle and the preload rule to apply before reading anything (R-3). */
  untilIdle?: boolean;
};

/**
 * Load `url` in a fresh context (empty cache, SW blocked, the project's color
 * scheme) and report every heritage request it made and the band's state.
 */
async function loadFresh(browser: Browser, baseURL: string, colorScheme: "light" | "dark", load: Load) {
  const context = await browser.newContext({ baseURL, colorScheme, serviceWorkers: "block", viewport: load.viewport });
  await context.addInitScript(trackHeritageIdle);
  const page = await context.newPage();
  if (load.media) await page.emulateMedia(load.media);
  const watched = watchHeritage(page);
  await page.goto(load.url);
  await page.waitForLoadState("networkidle");
  if (load.settleMs) await page.waitForTimeout(load.settleMs);
  if (load.untilIdle) {
    // R-3: networkidle can come before idle, so "fetches nothing" was read
    // before the preload had its chance. Settled = data-idle set, two frames
    // on (any preload image is requested by then), then every heritage
    // request seen so far answered. (A second networkidle wait would return
    // at once: it already fired for this document.) Don't wait for the
    // preload's image itself: where it is hidden it is never fetched. The
    // positive controls in TC-101 and TC-102 prove this settle sees a preload.
    await page.waitForSelector("[data-heritage][data-idle] [data-heritage-preload]", { state: "attached" });
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await Promise.all(watched.map((r) => r.response()));
  }
  const timeline = await heritageTimeline(page, watched);
  const requests = watched.map((r) => new URL(r.url()).pathname);
  const band = await page.evaluate(() => {
    const el = document.querySelector("[data-heritage]");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      level: el.getAttribute("data-level"),
      display: cs.display,
      idle: el.hasAttribute("data-idle"),
      opacity: cs.opacity,
      height: cs.height,
      position: cs.backgroundPosition,
    };
  });
  const pathname = new URL(page.url()).pathname;
  const count = await page.locator("[data-heritage]").count();
  await context.close();
  // `requests` is every heritage request; `firstPaint` drops the idle preload's.
  return { requests, firstPaint: timeline.beforeIdle, everIdle: timeline.idleAt !== null, band, pathname, count };
}

function schemeOf(info: { project: { use: { colorScheme?: string | null } } }): "light" | "dark" {
  return info.project.use.colorScheme === "dark" ? "dark" : "light";
}

test("TC-101: below 768 only Home fetches art, and only the theme's strip (F5)", async ({ browser, baseURL }, info) => {
  const theme = schemeOf(info);
  const viewport = { width: 390, height: 844 };

  // Positive control: the same untilIdle settle the off routes use must see
  // Home's idle preload, or their "fetched nothing" could pass vacuously.
  const home = await loadFresh(browser, baseURL!, theme, { url: "/", viewport, untilIdle: true });
  expect(home.band).toMatchObject({ level: "normal", display: "block" });
  expect(home.firstPaint.length).toBeGreaterThan(0);
  for (const r of home.firstPaint) expect(r).toMatch(new RegExp(`^/heritage/heritage-${theme}-strip\\.v\\d+\\.(avif|webp)$`));
  const preloaded = home.requests.filter((r) => r.includes(`heritage-${other(theme)}-`));
  expect(preloaded).toHaveLength(1);
  expect(preloaded[0]).toMatch(new RegExp(`^/heritage/heritage-${other(theme)}-strip\\.v\\d+\\.(avif|webp)$`));

  for (const url of ["/queue", "/drafts"]) {
    const off = await loadFresh(browser, baseURL!, theme, { url, viewport, untilIdle: true });
    expect(off.pathname, url).toBe(url);
    expect(off.band?.display, url).toBe("none");
    expect(off.band?.idle, url).toBe(true);
    expect(off.requests, url).toEqual([]);
  }
});

test("TC-102: forced colors and print hide the art and fetch nothing (F6)", async ({ browser, baseURL }, info) => {
  const theme = schemeOf(info);
  // R-1: the 390 Home run is the one that needs `!important`, because the
  // mobile Home rule (display:block) is more specific than the override.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    // Positive control: without the media, the same settle sees the preload.
    const control = await loadFresh(browser, baseURL!, theme, { url: "/", viewport, untilIdle: true });
    expect(control.requests.filter((r) => r.includes(`heritage-${other(theme)}-`)), `${viewport.width} control`).toHaveLength(1);
    for (const media of [{ forcedColors: "active" }, { media: "print" }] as const) {
      const label = `${viewport.width} ${JSON.stringify(media)}`;
      const r = await loadFresh(browser, baseURL!, theme, { url: "/", viewport, media, untilIdle: true });
      // Soft, so one run reports every viewport × media pair that fails.
      expect.soft(r.band?.level, label).toBe("normal");
      expect.soft(r.band?.display, label).toBe("none");
      expect.soft(r.band?.idle, label).toBe(true);
      expect.soft(r.requests, label).toEqual([]);
    }
  }
});

/** Every @media condition, as served, wrapping a rule whose selector starts with / contains `match`. */
async function mediaFor(page: Page, match: { startsWith: string } | { includes: string }): Promise<string[]> {
  // No `new Function` here: the production CSP has no 'unsafe-eval'.
  return page.evaluate((m) => {
    const hit = (s: string) => ("startsWith" in m ? s.startsWith(m.startsWith) : s.includes(m.includes));
    const out = new Set<string>();
    // Covers both shapes: `@media { .x {} }` and nested `.x { @media {} }`.
    const walk = (rules: CSSRuleList, media: string | null, selector: string | null) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) {
          if (selector && hit(selector)) out.add(rule.conditionText);
          walk(rule.cssRules, rule.conditionText, selector);
        } else if (rule instanceof CSSStyleRule) {
          if (media && hit(rule.selectorText)) out.add(media);
          walk(rule.cssRules, media, rule.selectorText);
        } else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, media, selector);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules, null, null);
    return [...out];
  }, match);
}

// R-4: the heritage breakpoints must be Tailwind's own md/lg, not `max-width:
// 767px`/`1023px`. Those leave a gap at fractional widths (zoom, odd DPRs:
// 767.5px is the mobile layout with the desktop art). Chromium snaps every
// viewport and iframe to whole CSS pixels, so the gap can't be reproduced
// here; this guards the served conditions instead, plus the integer edges.
test("TC-101b: heritage breakpoints are Tailwind's md/lg as served, with no fractional gap (R-4)", async ({ browser, baseURL }, info) => {
  const theme = schemeOf(info);
  const context = await browser.newContext({ baseURL, colorScheme: theme, serviceWorkers: "block" });
  const page = await context.newPage();
  await openHome(page);
  const md = await mediaFor(page, { startsWith: ".md\\:" });
  const lg = await mediaFor(page, { startsWith: ".lg\\:" });
  const heritage = await mediaFor(page, { includes: "[data-heritage]" });
  await context.close();

  // Lightning CSS may lower range syntax (`(width >= 48rem)` → `(min-width:
  // 48rem)`), so derive the expected heritage conditions from Tailwind's own.
  const mdCond = md.find((c) => c.includes("48rem") && !c.includes("not"));
  const lgCond = lg.find((c) => c.includes("64rem") && !c.includes("not"));
  expect(mdCond, `Tailwind md in ${JSON.stringify(md)}`).toMatch(/^\((?:min-width: 48rem|width >= 48rem)\)$/);
  expect(lgCond, `Tailwind lg in ${JSON.stringify(lg)}`).toMatch(/^\((?:min-width: 64rem|width >= 64rem)\)$/);
  const lowered = mdCond!.startsWith("(min-width");
  const mobile = lowered ? `not all and ${mdCond}` : "(width < 48rem)";
  const tablet = lowered ? `${mdCond} and (not ${lgCond})` : "(48rem <= width < 64rem)";
  // Exactly the complement of md, and md up to lg. Nothing in px.
  expect(heritage).toEqual(expect.arrayContaining([mobile, tablet]));
  for (const m of heritage) expect(m, "no px breakpoints on the heritage band").not.toMatch(/\d+px/);

  // The whole-pixel edges either side of each breakpoint.
  const at = async (width: number) => (await loadFresh(browser, baseURL!, theme, { url: "/queue", viewport: { width, height: 900 } })).band;
  expect((await at(767))?.display, "767").toBe("none");
  // The tablet box is a fixed 600px (EXE115); desktop's clamp reads 430px at 1024.
  expect(await at(768), "768").toMatchObject({ display: "block", height: "600px" });
  expect(await at(1023), "1023").toMatchObject({ display: "block", height: "600px" });
  expect((await at(1024))?.height, "1024").not.toBe("600px");
});

// R-5: the computed strength and the tablet box, not just the attribute.
test("TC-101c: reduced routes are quieter and tablet uses the 600px box at 15% (R-5, EXE115)", async ({ browser, baseURL }, info) => {
  const theme = schemeOf(info);
  const drafts = await loadFresh(browser, baseURL!, theme, { url: "/drafts", viewport: { width: 1440, height: 900 } });
  expect(drafts.band).toMatchObject({ level: "reduced", display: "block", opacity: "0.6" });
  const queue = await loadFresh(browser, baseURL!, theme, { url: "/queue", viewport: { width: 800, height: 900 } });
  expect(queue.band).toMatchObject({ level: "normal", display: "block", opacity: "1", height: "600px" });
  expect(queue.band?.position).toMatch(/^15% /);
});

test("TC-103: a route at level off renders an inert layer and fetches nothing (SC9)", async ({ browser, baseURL }, info) => {
  // Past the 4 s rIC timeout, with the observer watching, so "never idle" means never (R-3).
  const r = await loadFresh(browser, baseURL!, schemeOf(info), {
    url: "/e2e-harness",
    viewport: { width: 1440, height: 900 },
    settleMs: 4500,
  });
  expect(r.pathname).toBe("/e2e-harness");
  expect(r.band).toMatchObject({ level: "off", display: "none", idle: false });
  expect(r.everIdle, "data-idle was set at some point").toBe(false);
  expect(r.requests).toEqual([]);
});

// Regression guard (R-6): ShellGate already rendered these bare before 46.3.
test("TC-104: auth routes never mount the layer (F1)", async ({ browser, baseURL }, info) => {
  for (const route of ["/welcome", "/sign-in", "/sign-up", "/onboarding"]) {
    // Signed out per tab (see onboarding.spec), so the bare auth screen renders.
    const r = await loadFresh(browser, baseURL!, schemeOf(info), { url: `${route}?__session=none`, viewport: { width: 1440, height: 900 } });
    expect(r.pathname, route).toBe(route);
    expect(r.count, route).toBe(0);
    expect(r.requests, route).toEqual([]);
  }
});

// TASK-46.4 · Idle preload of the other theme (F4), Save-Data skip.

const other = (theme: "light" | "dark") => (theme === "light" ? "dark" : "light");

test("TC-106b: after idle, exactly one request for the other theme, issued after data-idle (F4)", async ({ browser, baseURL }, info) => {
  const theme = schemeOf(info);
  for (const { viewport, size } of [
    { viewport: { width: 1440, height: 900 }, size: "desk" },
    { viewport: { width: 390, height: 844 }, size: "strip" },
  ]) {
    const label = `${viewport.width}`;
    const context = await browser.newContext({ baseURL, colorScheme: theme, serviceWorkers: "block", viewport });
    await context.addInitScript(trackHeritageIdle);
    const page = await context.newPage();
    const watched = watchHeritage(page);
    await openHome(page);
    await page.waitForFunction(() => document.querySelector("[data-heritage][data-idle]") !== null);
    // R-3: a fixed 1 s after data-idle could read before the preload request
    // existed. Settled = the other theme's request seen and answered.
    const isOpposite = (r: Request) => new URL(r.url()).pathname.includes(`heritage-${other(theme)}-`);
    await expect.poll(() => watched.filter(isOpposite).length, `${label} preload request`).toBeGreaterThan(0);
    await Promise.all(watched.filter(isOpposite).map((r) => r.response()));
    // A late duplicate would still be in flight here; give it a chance to land
    // before counting (R-3 finding 2). Best effort: this waits only if
    // networkidle has not already fired for this document.
    await page.waitForLoadState("networkidle");
    const t = await heritageTimeline(page, watched);
    await context.close();
    const opposite = watched.filter(isOpposite).map((r) => new URL(r.url()).pathname);

    expect(opposite, label).toHaveLength(1);
    expect(opposite[0], label).toMatch(new RegExp(`^/heritage/heritage-${other(theme)}-${size}\\.v\\d+\\.(avif|webp)$`));
    expect(t.idleAt, label).not.toBeNull();
    expect(t.beforeIdle.filter((p) => p.includes(`heritage-${other(theme)}-`)), `${label} first paint`).toEqual([]);
    expect(t.afterIdle, `${label} after idle`).toEqual(opposite);
  }
});

// R-1 scar: the layer stays mounted across client navigations, so `idle` set on
// a normal route outlived a move to an `off` one and kept data-idle (and with it
// the preload rule) on a layer that must be inert. history.pushState goes
// through the Next router (usePathname follows it) and needs no link to the
// harness route.
test("TC-103b: moving to a route at level off drops data-idle from the layer (R-1)", async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ baseURL, colorScheme: schemeOf(info), serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await openHome(page);
  const band = page.locator("[data-heritage]");
  await expect(band).toHaveAttribute("data-idle", "", { timeout: 10_000 });
  await page.evaluate(() => window.history.pushState(null, "", "/e2e-harness"));
  await expect(band).toHaveAttribute("data-level", "off");
  const state = await band.evaluate((el) => ({ idle: el.hasAttribute("data-idle"), display: getComputedStyle(el).display }));
  await context.close();
  expect(state).toEqual({ idle: false, display: "none" });
});

test("TC-107b: Save-Data skips the preload: no other-theme request and no data-idle within 5 s", async ({ browser, baseURL }, info) => {
  const theme = schemeOf(info);
  const context = await browser.newContext({ baseURL, colorScheme: theme, serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData: true }) });
  });
  await context.addInitScript(trackHeritageIdle);
  const page = await context.newPage();
  const watched = watchHeritage(page);
  await openHome(page);
  await page.waitForTimeout(5000);
  const saveData = await page.evaluate(() => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const t = await heritageTimeline(page, watched);
  const seen = watched.map((r) => new URL(r.url()).pathname);
  const idleAttr = await page.locator("[data-heritage]").getAttribute("data-idle");
  await context.close();

  expect(saveData, "the override took").toBe(true);
  expect(seen.length, "the theme's own art still loads").toBeGreaterThan(0);
  expect(seen.filter((p) => p.includes(`heritage-${other(theme)}-`))).toEqual([]);
  expect(t.idleAt).toBeNull();
  expect(idleAttr).toBeNull();
});

// TASK-46.8 · TC-125 (SC7): the splash hands off to a finished background.
// Cold cinematic load (`?__splash=1`, motion allowed, the splash-on
// preconditions from splash.spec.ts). An init script stamps the moment
// html[data-splash] first reads "done" (epoch ms, the page's clock); the band's
// own art request must have finished by then, on the browser's network clock.
type SplashWindow = Window & { __splashDoneAt?: number };

test("TC-125: the heritage art is complete when the splash hands off (SC7)", async ({ browser, baseURL }, info) => {
  const theme = schemeOf(info);
  const context = await browser.newContext({ baseURL, colorScheme: theme, serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
      window.sessionStorage.removeItem("verilane-splash-seen");
    } catch {
      // Storage blocked: the splash stays off and the "painted" check fails loudly.
    }
    const w = window as SplashWindow;
    // Observe `document` with subtree: <html> may not exist yet when this runs.
    new MutationObserver(() => {
      if (w.__splashDoneAt === undefined && document.documentElement?.dataset.splash === "done") {
        w.__splashDoneAt = performance.timeOrigin + performance.now();
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-splash"] });
  });
  const page = await context.newPage();
  const finished: { path: string; endAt: number }[] = [];
  page.on("requestfinished", (r) => {
    if (!r.url().includes("/heritage/")) return;
    const t = r.timing();
    finished.push({ path: new URL(r.url()).pathname, endAt: t.responseEnd >= 0 ? t.startTime + t.responseEnd : Number.NaN });
  });
  await page.goto("/?__splash=1");
  await page.waitForFunction(() => document.documentElement.dataset.splash === "done", undefined, { timeout: 20_000 });
  const painted = await page.evaluate(() => performance.getEntriesByName("splash:painted").length);
  const doneAt = await page.evaluate(() => (window as SplashWindow).__splashDoneAt ?? null);
  const own = `heritage-${theme}-desk.`;
  await expect.poll(() => finished.filter((f) => f.path.includes(own)).length, { message: "the band's art request finished" }).toBeGreaterThan(0);
  const art = finished.find((f) => f.path.includes(own))!;
  const decoded = await page.evaluate(async (path) => {
    const img = new Image();
    img.src = path;
    await img.decode();
    return img.naturalWidth;
  }, art.path);
  await context.close();

  info.annotations.push({ type: "tc-125", description: JSON.stringify({ art, doneAt, leadMs: doneAt === null ? null : doneAt - art.endAt }) });
  expect(painted, "the cinematic splash ran").toBe(1);
  expect(doneAt, "data-splash reached done").not.toBeNull();
  expect(art.endAt, `${art.path} finished before or at hand-off`).toBeLessThanOrEqual(doneAt!);
  expect(decoded).toBeGreaterThan(0);
});
