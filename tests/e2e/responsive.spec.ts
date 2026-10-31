import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// TASK-20 · Responsive shell (Design.md §13) — TC-062/063/064, plus the
// milestone review's R2 axe sweep (every route, both themes via the two
// Playwright projects).

const REPORTS_DIR = "/Volumes/E Drive/Dev/.scratch/verilane/reports";

const NAV_ROUTES = [
  { href: "/", label: "Home" },
  { href: "/queue", label: "Queue" },
  { href: "/disputes", label: "Disputes" },
  { href: "/payments", label: "Payments" },
  { href: "/drafts", label: "Drafts" },
  { href: "/audit", label: "Audit log" },
  { href: "/settings", label: "Settings" },
] as const;
const INVESTIGATION = "/invoices/INV-042";
const ALL_ROUTES = [...NAV_ROUTES.map((r) => r.href), INVESTIGATION];

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;

/** Navigate and wait until the page's data (not the R3 shell skeleton) is up. */
async function open(page: Page, href: string): Promise<void> {
  await page.goto(href);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
  if (href === "/queue") await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();
  if (href.startsWith("/invoices/")) await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
}

test("TC-062: no route scrolls horizontally at 1440, 1280, 768 or 390", async ({ page }) => {
  // Seed once so every route renders real data.
  await open(page, "/queue");
  const overflow: string[] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const href of ALL_ROUTES) {
      await open(page, href);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (scrollWidth > innerWidth) overflow.push(`${href} @${vp.width}: ${scrollWidth} > ${innerWidth}`);
    }
  }
  expect(overflow).toEqual([]);
});

test("TC-063: at 390 the bottom tabs + More reach all 7 routes with 48px targets; at 768 the rail is labelled", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/queue");

  const tabs = page.getByRole("navigation", { name: "Mobile" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Primary" })).toHaveCount(0);

  for (const el of await tabs.locator("a, button").all()) {
    const box = await el.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
  }

  for (const route of NAV_ROUTES) {
    await open(page, route.href === "/" ? "/queue" : "/");
    const direct = tabs.getByRole("link", { name: route.label, exact: true });
    if (await direct.count()) {
      await direct.click();
    } else {
      await tabs.getByRole("button", { name: "More" }).click();
      const sheet = page.getByRole("dialog", { name: "More" });
      await expect(sheet).toBeVisible();
      const link = sheet.getByRole("link", { name: route.label, exact: true });
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
      await link.click();
      await expect(sheet).toBeHidden();
    }
    await expect(page).toHaveURL(new RegExp(`${route.href === "/" ? "/$" : `${route.href}$`}`));
  }

  if (testInfo.project.name === "chromium-light") {
    await open(page, "/queue");
    await tabs.getByRole("button", { name: "More" }).click();
    await page.screenshot({ path: `${REPORTS_DIR}/TASK-20-390-more-sheet.png` });
    await page.keyboard.press("Escape");
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page, "/queue");
  await expect(tabs).toBeHidden();
  const rail = page.getByRole("complementary", { name: "Primary" });
  await expect(rail).toBeVisible();
  const railLinks = rail.getByRole("navigation", { name: "Main" }).getByRole("link");
  await expect(railLinks).toHaveCount(NAV_ROUTES.length);
  const box = await rail.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(72);
  for (const route of NAV_ROUTES) {
    const link = rail.getByRole("link", { name: route.label, exact: true });
    await expect(link).toHaveAttribute("aria-label", route.label);
    await link.hover();
    await expect(page.getByRole("tooltip")).toHaveText(route.label);
  }
});

/**
 * Tabs through the page and checks: the focus sequence equals the DOM order
 * of visible focusables, no focusable is visually reordered by CSS (`order`,
 * reversed flex), and every focused element changes visibly.
 */
async function checkFocusOrder(page: Page): Promise<void> {
  const positive = await page
    .locator("[tabindex]")
    .evaluateAll((els) => els.filter((e) => Number(e.getAttribute("tabindex")) > 0).map((e) => e.outerHTML));
  expect(positive).toEqual([]);

  const expected = await page.evaluate(() => {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(
      (e) => e.checkVisibility({ visibilityProperty: true }) && e.tabIndex >= 0 && !e.closest("[inert]"),
    );
    els.forEach((e, i) => e.setAttribute("data-focus-idx", String(i)));
    const reordered = els
      .filter((e) => {
        for (let n: HTMLElement | null = e; n && n !== document.body; n = n.parentElement) {
          const parent = n.parentElement;
          if (!parent) break;
          const ps = getComputedStyle(parent);
          if (getComputedStyle(n).order !== "0") return true;
          if (ps.display.includes("flex") && ps.flexDirection.endsWith("reverse")) return true;
        }
        return false;
      })
      .map((e) => e.outerHTML.slice(0, 80));
    return { count: els.length, reordered };
  });
  expect(expected.reordered).toEqual([]);

  // Walk the first 40 stops — enough to cover the shell and the page's
  // leading content without depending on the length of the data.
  const steps = Math.min(expected.count, 40);
  const seen: string[] = [];
  const invisible: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      const focusedStyle = `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}|${s.backgroundColor}`;
      return {
        idx: el.getAttribute("data-focus-idx") ?? `?${el.tagName}`,
        visible: (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none",
        focusedStyle,
        html: el.outerHTML.slice(0, 80),
      };
    });
    seen.push(info?.idx ?? "null");
    if (info && !info.visible) {
      // A background change also reads as a focus indicator (RowCard).
      const blurredStyle = await page.evaluate((idx) => {
        const el = document.querySelector<HTMLElement>(`[data-focus-idx="${idx}"]`);
        if (!el) return "";
        el.blur();
        const s = getComputedStyle(el);
        const out = `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}|${s.backgroundColor}`;
        el.focus({ focusVisible: true } as FocusOptions);
        return out;
      }, info.idx);
      if (blurredStyle === info.focusedStyle) invisible.push(info.html);
    }
  }
  expect(seen).toEqual(Array.from({ length: steps }, (_, i) => String(i)));
  expect(invisible).toEqual([]);
}

for (const width of [1440, 390] as const) {
  test(`TC-064: no positive tabindex; focus follows DOM/visual order and stays visible @${width}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.find((v) => v.width === width)!);
    for (const href of ["/queue", INVESTIGATION]) {
      await open(page, href);
      await checkFocusOrder(page);
    }
  });
}

test("R2: every route has no serious or critical axe violations", async ({ page }) => {
  await open(page, "/queue");
  const found: string[] = [];
  for (const href of ALL_ROUTES) {
    await open(page, href);
    const { violations } = await new AxeBuilder({ page }).analyze();
    for (const v of violations) {
      if (v.impact !== "serious" && v.impact !== "critical") continue;
      for (const n of v.nodes) found.push(`${href} ${v.id} (${v.impact}) ${n.target.join(" ")}: ${n.any[0]?.message ?? ""}`);
    }
  }
  expect(found).toEqual([]);
});

test("TASK-20 screenshots at 1440, 1280, 768, 390", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-light", "screenshots once, light theme");
  await open(page, "/queue");
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const href of ["/queue", INVESTIGATION]) {
      await open(page, href);
      const name = href === "/queue" ? "queue" : "investigation";
      await page.screenshot({ path: `${REPORTS_DIR}/TASK-20-${vp.width}-${name}.png`, fullPage: true });
    }
  }
});
