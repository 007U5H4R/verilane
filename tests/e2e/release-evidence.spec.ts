import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// TASK-79.9 (TKT-75.09) · release evidence for the surfaces TASK-75 added or
// changed — Home NSM, /exceptions, /exceptions/[id] and the sidebar badge:
//   TC-75.47 four screen states + offline, on the real build
//   TC-75.48 1280 / 1024 / 768 / 375 screenshots, no horizontal scroll
//   TC-75.49 axe clean (no serious/critical), keyboard path, focus order
// Screenshots and JSON land in the release evidence pack under a label
// (RELEASE_LABEL, default `base-a3a0f14`) so the final post-79.5/79.8 run can
// sit beside this one. Writing evidence never fails a test.

const LABEL = process.env.RELEASE_LABEL ?? "base-a3a0f14";
const PACK = `/Volumes/E Drive/Dev/.scratch/task75/release/${LABEL}`;
const ID = "RV-PAY-P-012";
const OFFLINE = "You're offline — viewing cached data; some actions are paused";

const ROUTES = [
  { name: "home", href: "/" },
  { name: "exceptions", href: "/exceptions" },
  { name: "exception-detail", href: `/exceptions/${ID}` },
] as const;
const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
] as const;

function save(file: string, data: unknown): void {
  try {
    mkdirSync(PACK, { recursive: true });
    writeFileSync(`${PACK}/${file}`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  } catch {
    /* evidence is best-effort; the assertions are the gate */
  }
}

async function shot(page: Page, file: string): Promise<void> {
  try {
    mkdirSync(`${PACK}/screens`, { recursive: true });
    await page.screenshot({ path: `${PACK}/screens/${file}.png`, fullPage: true });
  } catch {
    /* best-effort */
  }
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

// ---------------------------------------------------------------- TC-75.47

test("TC-75.47: Home NSM — page states, NSM empty / working / error, and offline", async ({ page, context }, info) => {
  const p = info.project.name;
  const nsm = page.getByTestId("home-nsm");

  // Page-level states (Home owns the NSM section, so these cover it too).
  await open(page, "/?__state=loading");
  await expect(page.locator('[data-state="loading"]')).toHaveAttribute("aria-busy", "true");
  await shot(page, `states-home-loading-${p}`);
  await open(page, "/?__state=empty");
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();
  await shot(page, `states-home-empty-${p}`);
  await open(page, "/?__state=error");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t load the home page." }).getByRole("button", { name: "Retry" })).toBeVisible();
  await shot(page, `states-home-error-${p}`);

  // NSM empty: a fresh session has resolved nothing.
  await open(page, "/");
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(nsm.locator("[data-nsm-state]")).toHaveAttribute("data-nsm-state", "empty");
  await expect(nsm).toContainText("No exceptions resolved yet this session.");
  await expect(page.getByTestId("home-nsm-value")).toHaveText("₹0.00");
  await shot(page, `states-nsm-empty-${p}`);

  // NSM working: P-012 is auto-executed on view, then Home shows ₹25,000.
  await open(page, `/exceptions/${ID}`);
  await expect(page.getByTestId("exception-status")).toHaveText("Resolved");
  await open(page, "/");
  await expect(nsm.locator("[data-nsm-state]")).toHaveAttribute("data-nsm-state", "working");
  await expect(page.getByTestId("home-nsm-value")).toHaveText("₹25,000.00");
  await shot(page, `states-nsm-working-${p}`);

  // NSM offline: the figure stays, with the device-data note.
  await context.setOffline(true);
  try {
    await expect(page.getByText(OFFLINE)).toBeVisible();
    await expect(page.getByTestId("home-nsm-offline")).toHaveText("Offline — computed from this device’s data.");
    await expect(page.getByTestId("home-nsm-value")).toHaveText("₹25,000.00");
    await shot(page, `states-nsm-offline-${p}`);
  } finally {
    await context.setOffline(false);
  }

  // NSM error: isolated to its block.
  await open(page, "/?__block_error=nsm");
  const block = page.getByTestId("home-block-nsm");
  await expect(block.getByRole("alert")).toContainText("Couldn’t compute the North Star Metric.");
  await expect(block.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByTestId("task-feed")).toBeVisible();
  await shot(page, `states-nsm-error-${p}`);
  // NSM loading is not forceable in the real UI (data comes from IndexedDB in
  // one tick); it is covered by src/components/home/NsmSection.test.ts.
});

test("TC-75.47: /exceptions and /exceptions/[id] — four states and offline", async ({ page, context }, info) => {
  const p = info.project.name;
  await open(page, "/exceptions?__state=loading");
  await expect(page.locator('[data-state="loading"]').first()).toBeVisible();
  await shot(page, `states-exceptions-loading-${p}`);
  await open(page, "/exceptions?__state=empty");
  await expect(page.locator('[data-state="empty"]')).toContainText("No exceptions to review");
  await shot(page, `states-exceptions-empty-${p}`);
  await open(page, "/exceptions?__state=error");
  await expect(page.getByRole("alert").filter({ hasText: "Error loading exceptions. Retry?" }).getByRole("button", { name: "Retry" })).toBeVisible();
  await shot(page, `states-exceptions-error-${p}`);
  await open(page, "/exceptions");
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await shot(page, `states-exceptions-working-${p}`);
  await context.setOffline(true);
  try {
    await expect(page.getByText(OFFLINE)).toBeVisible();
    await expect(page.locator(`[data-testid="exception-row"][data-id="${ID}"]`)).toBeVisible();
    await shot(page, `states-exceptions-offline-${p}`);
  } finally {
    await context.setOffline(false);
  }

  await open(page, `/exceptions/${ID}?__state=loading`);
  await expect(page.locator('[data-state="loading"]').first()).toBeVisible();
  await shot(page, `states-detail-loading-${p}`);
  await open(page, "/exceptions/RV-DOES-NOT-EXIST");
  await expect(page.locator('[data-state="not-found"]')).toContainText("Exception not found.");
  await shot(page, `states-detail-empty-notfound-${p}`);
  await open(page, `/exceptions/${ID}?__state=error`);
  await expect(page.getByRole("alert").filter({ hasText: "Error loading exception. Retry?" }).getByRole("button", { name: "Retry" })).toBeVisible();
  await shot(page, `states-detail-error-${p}`);
  await open(page, `/exceptions/${ID}`);
  await expect(page.locator('[data-state="working"]')).toBeVisible();
  await expect(page.getByTestId("execute-status")).toBeVisible();
  await shot(page, `states-detail-working-${p}`);
  await context.setOffline(true);
  try {
    await expect(page.getByText(OFFLINE)).toBeVisible();
    await expect(page.getByTestId("payment-evidence")).toContainText("P-012");
    await expect(page.getByTestId("policy-decision-card")).toBeVisible();
    await shot(page, `states-detail-offline-${p}`);
  } finally {
    await context.setOffline(false);
  }
});

test("TC-75.47: sidebar Exceptions badge — working, zero, and offline", async ({ page, context }, info) => {
  const p = info.project.name;
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "/");
  const nav = page.getByRole("complementary", { name: "Primary" });
  const badge = nav.getByTestId("exception-count");
  const open_ = await page.evaluate(() => window.__verilane!.db.exceptions.where("status").equals("open").count());
  expect(open_, "seed raises open exceptions").toBeGreaterThan(0);
  await expect(badge).toHaveText(String(open_));
  await shot(page, `states-sidebar-working-${p}`);

  await context.setOffline(true);
  try {
    await expect(page.getByText(OFFLINE)).toBeVisible();
    await expect(badge).toHaveText(String(open_));
    await shot(page, `states-sidebar-offline-${p}`);
  } finally {
    await context.setOffline(false);
  }

  // Empty: nothing open → the live count drops to 0 (the badge stays, reading "0").
  await page.evaluate(() =>
    window.__verilane!.db.exceptions.where("status").equals("open").modify({ status: "actioned" }),
  );
  await expect(badge).toHaveText("0");
  await shot(page, `states-sidebar-zero-${p}`);
  // Loading: ExceptionCount renders nothing until the count resolves (no
  // spinner by design); there is no error state for the badge — a failed
  // count leaves it absent. Neither is forceable from the UI.
});

// ---------------------------------------------------------------- TC-75.48

test("TC-75.48: 1280/1024/768/375 — screenshots and no horizontal scroll", async ({ page }, info) => {
  test.setTimeout(120_000);
  const results: { route: string; width: number; overflow: number }[] = [];
  for (const vp of WIDTHS) {
    await page.setViewportSize(vp);
    for (const r of ROUTES) {
      await open(page, r.href);
      await expect(page.locator('[data-state="working"]').first()).toBeVisible();
      const overflow = await overflowPx(page);
      results.push({ route: r.href, width: vp.width, overflow });
      await shot(page, `bp-${r.name}-${vp.width}-${info.project.name}`);
    }
  }
  save(`TC-75.48-breakpoints-${info.project.name}.json`, results);
  expect(results.filter((r) => r.overflow > 0)).toEqual([]);
});

// ---------------------------------------------------------------- TC-75.49

test("TC-75.49: axe — no serious or critical violations at 1280 and 375", async ({ page }, info) => {
  test.setTimeout(120_000);
  const found: string[] = [];
  const results: { route: string; width: number; violations: { id: string; impact: string | null | undefined; nodes: number }[] }[] = [];
  for (const vp of [WIDTHS[0], WIDTHS[3]]) {
    await page.setViewportSize(vp);
    for (const r of ROUTES) {
      await open(page, r.href);
      await expect(page.locator('[data-state="working"]').first()).toBeVisible();
      if (r.href.startsWith("/exceptions/")) await expect(page.getByTestId("execute-status")).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      results.push({
        route: r.href,
        width: vp.width,
        violations: violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      });
      for (const v of violations) {
        if (v.impact !== "serious" && v.impact !== "critical") continue;
        for (const n of v.nodes) found.push(`${r.href} @${vp.width} ${v.id} (${v.impact}) ${n.target.join(" ")}`);
      }
    }
  }
  save(`TC-75.49-axe-${info.project.name}.json`, { found, results });
  expect(found).toEqual([]);
});

async function tabTo(page: Page, locator: ReturnType<Page["getByRole"]>, maxSteps = 120): Promise<number> {
  for (let i = 0; i < maxSteps; i++) {
    if (await locator.evaluate((el) => el === document.activeElement).catch(() => false)) return i;
    await page.keyboard.press("Tab");
  }
  throw new Error("control not reached by Tab within the step budget");
}

interface Stop {
  tag: string;
  name: string;
  x: number;
  y: number;
  inMain: boolean;
  outline: string;
}

async function focusOrder(page: Page, steps: number): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
        x: Math.round(r.left + window.scrollX),
        y: Math.round(r.top + window.scrollY),
        inMain: el.closest("main") !== null,
        outline: `${cs.outlineStyle} ${cs.outlineWidth} | ${cs.boxShadow === "none" ? "no-shadow" : "shadow"}`,
      };
    });
    // Past the last control focus leaves the page; stop before it wraps.
    if (!s) {
      if (stops.length > 0) break;
      continue;
    }
    stops.push(s);
  }
  return stops;
}

test("TC-75.49: keyboard path Exceptions → P-012 and a top-to-bottom focus order on both routes", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "/exceptions");
  const link = page.getByRole("link", { name: `Review Unallocated payment ${ID}` });
  await tabTo(page, link);
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/exceptions/${ID}$`));
  await expect(page.getByTestId("execute-status")).toBeVisible();

  // Fresh loads, so each order starts at the top of the document.
  await open(page, `/exceptions/${ID}`);
  await expect(page.getByTestId("execute-status")).toBeVisible();
  const detail = await focusOrder(page, 40);
  await open(page, "/exceptions");
  const list = await focusOrder(page, 30);
  save(`TC-75.49-focus-order-${info.project.name}.json`, { detail, list });

  // Inside <main>, every Tab moves down the page or along the same line —
  // never back up (2px tolerance for baseline differences in a row).
  for (const [name, stops] of [["detail", detail], ["list", list]] as const) {
    const main = stops.filter((s) => s.inMain);
    expect(main.length, `${name}: Tab reaches main content`).toBeGreaterThan(0);
    const backwards = main.slice(1).filter((s, i) => s.y < main[i]!.y - 2);
    expect(backwards, `${name}: focus order follows the visual order`).toEqual([]);
  }
  // Back-link is a real control that does something.
  await open(page, `/exceptions/${ID}`);
  const back = page.getByRole("link", { name: "← Back to exceptions" });
  await tabTo(page, back);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/exceptions$/);
});
