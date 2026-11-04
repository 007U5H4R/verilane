import { test, expect, type Browser, type Page } from "@playwright/test";

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
): Promise<string[]> {
  const context = await browser.newContext({ baseURL, colorScheme: opts.colorScheme, serviceWorkers: "block" });
  if (opts.stored) {
    const stored = opts.stored;
    await context.addInitScript((t) => localStorage.setItem("verilane-theme", t), stored);
  }
  const page = await context.newPage();
  const seen: string[] = [];
  page.on("request", (r) => {
    if (/heritage-/.test(r.url())) seen.push(r.url());
  });
  await openHome(page);
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");
  await context.close();
  return seen;
}

test("TC-095: the first heritage request matches the theme (light, stored dark, system dark)", async ({ browser, baseURL }) => {
  const cases = [
    { opts: { colorScheme: "light" as const }, stem: "heritage-light-", other: "heritage-dark-" },
    { opts: { colorScheme: "light" as const, stored: "dark" as const }, stem: "heritage-dark-", other: "heritage-light-" },
    { opts: { colorScheme: "dark" as const }, stem: "heritage-dark-", other: "heritage-light-" },
  ];
  for (const c of cases) {
    const seen = await firstHeritageRequest(browser, baseURL!, c.opts);
    expect(seen[0], JSON.stringify(c.opts)).toContain(c.stem);
    // No idle preload exists yet (TASK-46.4), so the other theme is never requested.
    expect(seen.filter((u) => u.includes(c.other)), JSON.stringify(c.opts)).toEqual([]);
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
test("TC-097: at 375 the bottom tabs never paint over shell overlays (R-1)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  /** What a tap just above the bottom edge, mid-screen, lands on. */
  const bottomHit = () =>
    page.evaluate(() => {
      const hit = document.elementFromPoint(187, window.innerHeight - 20);
      return {
        inDialog: !!hit?.closest('[role="dialog"]'),
        inNav: !!hit?.closest('nav[aria-label="Mobile"]'),
        href: hit?.closest("a")?.getAttribute("href") ?? null,
      };
    });

  // Nothing open: the tab under that point takes the tap and navigates.
  await openHome(page);
  const tab = await bottomHit();
  expect(tab).toMatchObject({ inDialog: false, inNav: true });
  expect(tab.href).toMatch(/^\/\w+$/);
  await page.mouse.click(187, 800 - 20);
  await expect(page).toHaveURL((u) => u.pathname === tab.href);

  // The disputes Filters side panel.
  await page.goto("/disputes");
  await ready(page);
  await page.getByRole("button", { name: /^Filter disputes/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await bottomHit()).toMatchObject({ inDialog: true, inNav: false });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await bottomHit()).toMatchObject({ inDialog: false, inNav: true });

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
  expect(await bottomHit()).toMatchObject({ inDialog: false, inNav: true });
});
