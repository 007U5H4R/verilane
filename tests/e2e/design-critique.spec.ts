import { test, expect, type Page } from "@playwright/test";

// TASK-49: Stage 7 design-critique fixes (DES-003, 006, 008, 009, 010, 012; DES-005 is in og.spec.ts).

async function ready(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

const topBar = (page: Page) => page.locator("header.topbar-wave");

// ── DES-003: a deep link lands below the sticky top bar, with the ring ─────
for (const width of [375, 1440]) {
  test(`DES-003: at ${width} a deep link lands below the top bar and rings the cited badge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    // Load the workspace first, so the deep link is a fresh document load.
    await page.goto("/queue");
    await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();
    const id = "ev-E-001-1:emails.json:email_class";
    await page.goto(`/invoices/INV-A#${id}`);
    const anchor = page.locator(`[id="${id}"]`);
    await expect(anchor).toHaveAttribute("data-landed", "");
    await expect(anchor).not.toHaveCSS("box-shadow", "none");
    await expect(anchor).toBeInViewport();
    // Fully below the sticky header, not tucked under it.
    await expect
      .poll(async () => {
        const header = await topBar(page).boundingBox();
        const box = await anchor.boundingBox();
        return header && box ? box.y - (header.y + header.height) : -1;
      })
      .toBeGreaterThanOrEqual(4);
  });
}

// ── DES-008: touch targets at 375 ───────────────────────────────────────────
// Rule (WCAG 2.2 SC 2.5.8, Target Size (Minimum), AA): every pointer target is
// at least 24×24 CSS px, or — the spacing exception — a 24px circle centred on
// it overlaps no other target and no other undersized target's circle.
// Exempt per 2.5.8: inline links in running text, and sr-only (1px) elements.
// The controls DES-008 named are held to 44px tall, the project's touch goal.
const TARGETS =
  'a[href], button, select, summary, input:not([type="hidden"]), [role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"]';

async function targetSizeViolations(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    type T = { el: Element; r: DOMRect; name: string };
    const targets: T[] = [];
    for (const raw of document.querySelectorAll(selector)) {
      // A native input inside a <label> is hit through the label: measure the label.
      const el = raw instanceof HTMLInputElement && raw.closest("label") ? raw.closest("label")! : raw;
      if (targets.some((t) => t.el === el)) continue;
      if (el.closest("[aria-hidden='true'], [inert], [hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
      if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) continue;
      // Inline link in a sentence: exempt.
      if (el.tagName === "A" && cs.display === "inline" && el.parentElement?.closest("p, li")) continue;
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      targets.push({ el, r, name: `${el.tagName.toLowerCase()} "${name}"` });
    }
    const small = (t: T) => t.r.width < 24 || t.r.height < 24;
    const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const distToRect = (p: { x: number; y: number }, r: DOMRect) => {
      const dx = Math.max(r.left - p.x, 0, p.x - r.right);
      const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
      return Math.hypot(dx, dy);
    };
    const bad: string[] = [];
    for (const t of targets.filter(small)) {
      const c = centre(t.r);
      const clash = targets.find((o) => {
        if (o === t || o.el.contains(t.el) || t.el.contains(o.el)) return false;
        if (small(o)) {
          const oc = centre(o.r);
          return Math.hypot(oc.x - c.x, oc.y - c.y) < 24;
        }
        return distToRect(c, o.r) < 12;
      });
      if (clash) bad.push(`${t.name} ${Math.round(t.r.width)}×${Math.round(t.r.height)} crowds ${clash.name}`);
    }
    return bad;
  }, TARGETS);
}

test.describe("DES-008: touch targets at 375", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const route of ["/queue", "/disputes", "/payments"]) {
    test(`DES-008: ${route} meets WCAG 2.5.8 target size`, async ({ page }) => {
      await page.goto(route);
      await ready(page);
      await expect(page.locator("main h1")).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await targetSizeViolations(page)).toEqual([]);
    });
  }

  test("DES-008: the queue's named controls are at least 44px tall", async ({ page }) => {
    await page.goto("/queue");
    await ready(page);
    await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();
    const main = page.locator("main");
    for (const loc of [
      main.getByRole("link", { name: /Import data/ }),
      main.getByRole("button", { name: /Show filters|Hide filters/ }),
      // The density toggle is a radiogroup, so its options are radios.
      main.getByRole("radio", { name: "Table" }),
      main.getByRole("radio", { name: "Compact" }),
    ]) {
      const box = await loc.first().boundingBox();
      expect(box?.height ?? 0, (await loc.first().textContent()) ?? "").toBeGreaterThanOrEqual(44);
    }
    const checkboxLabel = await main.getByRole("checkbox").first().evaluate((el) => {
      const r = (el.closest("label") ?? el).getBoundingClientRect();
      return Math.min(r.width, r.height);
    });
    expect(checkboxLabel, "row checkbox hit area").toBeGreaterThanOrEqual(44);
  });

  test("DES-008: disputes and payments primary controls are at least 44px tall", async ({ page }) => {
    for (const route of ["/disputes", "/payments"]) {
      await page.goto(route);
      await ready(page);
      await expect(page.locator("main h1")).toBeVisible();
      const short = await page.locator("main").evaluate((m) =>
        [...m.querySelectorAll<HTMLElement>("button, select, [role='tab'], summary")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 1 && r.height > 1 && !el.closest("[aria-hidden='true'], [hidden]");
          })
          .filter((el) => el.getBoundingClientRect().height < 44)
          .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().height)}px`),
      );
      expect(short, route).toEqual([]);
    }
  });
});

// ── DES-009: every route names itself in the tab title ─────────────────────
const TITLES: [string, string][] = [
  ["/", "Home — Verilane"],
  ["/queue", "Queue — Verilane"],
  ["/disputes", "Disputes — Verilane"],
  ["/emails", "Email Conversations — Verilane"],
  ["/invoices", "Invoices — Verilane"],
  ["/drafts", "Drafts — Verilane"],
  ["/payments", "Payments — Verilane"],
  ["/audit", "Audit Log — Verilane"],
  ["/settings", "Settings — Verilane"],
  ["/settings/eval", "Evaluation report — Verilane"],
  ["/invoices/INV-A", "Invoice — Verilane"],
  ["/disputes/D-E-011-1", "Dispute — Verilane"],
  ["/sign-in", "Sign in — Verilane"],
  ["/welcome", "Welcome — Verilane"],
];

test("DES-009: each route has its own <title>", async ({ page }) => {
  const wrong: string[] = [];
  for (const [route, title] of TITLES) {
    await page.goto(route);
    const got = await page.title();
    if (got !== title) wrong.push(`${route}: "${got}" (want "${title}")`);
  }
  expect(wrong).toEqual([]);
});

// ── DES-010: a branded 404 with a way home ─────────────────────────────────
test("DES-010: an unknown route gets the branded 404 with a link to Home", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  const home = page.locator("main").getByRole("link", { name: "Go to Home" });
  await expect(home).toHaveAttribute("href", "/");
  await expect(page).toHaveTitle("Page not found — Verilane");
  await home.click();
  await expect(page).toHaveURL(/\/$/);
});

// ── DES-006: labels and the collapsed rail's tooltips ──────────────────────
test("DES-006: the nav says Queue and the workspace name is never silently cut", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await ready(page);
  await expect(page.locator('aside a[href="/queue"]').first()).toContainText("Queue");
  await expect(page.locator('aside a[href="/queue"]').first()).not.toContainText("Collection");
  const name = page.getByText("Demo Workspace", { exact: true }).first();
  await expect(name).toHaveAttribute("title", "Demo Workspace");
});

test("DES-006: the collapsed rail shows a tooltip on hover and on focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const disputes = page.locator('a[href="/disputes"][aria-label]').first();
  await expect(disputes).toBeVisible();
  await disputes.hover();
  await expect(page.getByRole("tooltip")).toContainText("Disputes");
  // A real pointer leaves in several moves; Radix closes on the move after
  // pointerleave (its grace-area check), so one teleport never closes it.
  await page.mouse.move(800, 600, { steps: 8 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const payments = page.locator('a[href="/payments"][aria-label]').first();
  await payments.focus();
  await expect(page.getByRole("tooltip")).toContainText("Payments");
});

// ── DES-012: no AI-marketing chrome in the queue ───────────────────────────
test("DES-012: the queue column is 'Recommended action', with no sparkle icons", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/queue");
  await ready(page);
  await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();
  const table = page.locator("main table").first();
  await expect(table.getByRole("columnheader", { name: "Recommended action" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /AI Recommendation/i })).toHaveCount(0);
  await expect(table.locator("svg.lucide-sparkles")).toHaveCount(0);
});
