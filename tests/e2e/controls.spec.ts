import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Locator, type Page } from "@playwright/test";

// TASK-25.3 · TC-081: every control either has a real, observable effect, or
// is aria-disabled with a visible reason reachable via aria-describedby —
// never a dead `href="#"`/empty href, an unnamed control, or a button that
// does nothing.
//
// Two layers:
// 1. Structure (first test): no dead href, every control named, every
//    aria-disabled control points (via one or more aria-describedby ids) at
//    visible, non-empty reason text, and no ComingSoon placeholder.
// 2. Behaviour (click sweep): every enabled button-like control on every
//    route is clicked (selects get a new value) and must produce something
//    observable — a URL change or navigation, a DOM mutation (dialog, menu,
//    toast, text/state change), focus moving elsewhere, or a download /
//    popup / file chooser. Internal links must resolve to a page that loads.
//    A control with no handler fails. Known no-ops go in NO_OP_ALLOW with a
//    reason.

// /disputes/D-E-011-1 covers /disputes/[id] at a fixed seed dispute (T25-6).
const ROUTES = ["/", "/queue", "/disputes", "/payments", "/drafts", "/audit", "/settings", "/settings/eval", "/invoices/INV-042", "/disputes/D-E-011-1"];

async function open(page: Page, href: string): Promise<void> {
  await page.goto(href);
  // QA-005: the workspace gate (Dexie open + seed manifest fetch) normally
  // clears in <1.5s, but this helper runs ~170 times in the sweep below and a
  // loaded machine (load avg 15-23 on 8 cores) pushed one load past 5s.
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0, { timeout: 15_000 });
  if (href === "/queue") {
    // QA-001: the queue has its own "Loading queue" skeleton while its Dexie
    // live queries resolve after the workspace gate; across ~100 reloads in a
    // full-suite run that occasionally outlasted the default 5s. Wait for it.
    await expect(page.getByRole("status", { name: "Loading queue" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();
  }
  if (href.startsWith("/invoices/")) await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
  if (/^\/disputes\/./.test(href)) await expect(page.getByTestId("dispute-claim-text")).toBeVisible();
}

test("TC-081: no dead href, every control is named, and aria-disabled always has a visible reason", async ({ page }) => {
  const problems: string[] = [];
  for (const href of ROUTES) {
    await open(page, href);
    const found = await page.evaluate(() => {
      const bad: string[] = [];
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a")) {
        const hrefAttr = a.getAttribute("href");
        if (hrefAttr === "#" || hrefAttr === "") bad.push(`dead href on <a>: ${a.outerHTML.slice(0, 80)}`);
        if (!a.textContent?.trim() && !a.getAttribute("aria-label")) bad.push(`unnamed <a>: ${a.outerHTML.slice(0, 80)}`);
      }
      for (const b of document.querySelectorAll<HTMLButtonElement>("button")) {
        if (!b.textContent?.trim() && !b.getAttribute("aria-label")) bad.push(`unnamed <button>: ${b.outerHTML.slice(0, 80)}`);
        if (b.getAttribute("aria-disabled") === "true") {
          // aria-describedby is a space-separated id list; at least one
          // referenced node must be rendered (non-zero box) with text.
          const ids = (b.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
          const visibleReason = ids.some((id) => {
            const el = document.getElementById(id);
            if (!el || !el.textContent?.trim()) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          });
          if (!visibleReason) bad.push(`aria-disabled without a visible reason: ${b.outerHTML.slice(0, 80)}`);
        }
      }
      return bad;
    });
    problems.push(...found.map((f) => `${href}: ${f}`));
    if ((await page.getByRole("heading", { name: "Coming soon" }).count()) > 0) {
      problems.push(`${href}: ComingSoon placeholder still rendered`);
    }
  }
  expect(problems).toEqual([]);
});

test("TC-081: the primary action's disabled reason is visible when it is aria-disabled", async ({ page }) => {
  // Spot-check the documented exemplar (ActionBar primary-action) behaviorally:
  // a fresh invoice has no draft yet, so the primary action starts disabled
  // with its reason shown inline, not only in a tooltip.
  await open(page, "/invoices/INV-042");
  const primary = page.getByTestId("action-bar").getByTestId("primary-action");
  if ((await primary.getAttribute("aria-disabled")) === "true") {
    await expect(page.getByTestId("primary-reason")).toBeVisible();
    await expect(page.getByTestId("primary-reason")).toHaveText(/\S/);
  }
});

// ── Click-effect sweep ───────────────────────────────────────────────────

/** Known controls with no observable effect, each with the reason it is fine. */
const NO_OP_ALLOW: { route: RegExp; name: RegExp; reason: string }[] = [
  {
    route: /^\/$/,
    name: /^Analyst$/,
    reason:
      "already-selected segment of the Role switch (aria-pressed=true, the seed default); RoleSwitcher.choose() returns early when next === role. The Manager segment is swept.",
  },
];

const BUTTON_LIKE =
  'button, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], summary, select, input[type="checkbox"], input[type="radio"]';

interface Control {
  index: number;
  tag: string;
  name: string;
}

/**
 * Enabled, visible button-like controls. Scoped to <main> on every route and
 * to the app shell (everything outside <main>) on the first route only, so
 * shell controls are swept once rather than once per route.
 */
async function listControls(page: Page, includeShell: boolean): Promise<Control[]> {
  return page.evaluate(
    ({ selector, includeShell }) => {
      const main = document.querySelector("main");
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((el) => (includeShell ? true : !!main?.contains(el)))
        .filter((el) => {
          if (el.closest("[aria-hidden='true'], [inert]")) return false;
          if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return false;
          // Re-selecting the radio that is already selected is a no-op by design.
          if ((el as HTMLInputElement).type === "radio" && (el as HTMLInputElement).checked) return false;
          if (el.getAttribute("role") === "radio" && el.getAttribute("aria-checked") === "true") return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
        })
        .map((el, index) => ({
          index,
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute("aria-label") ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        }));
    },
    { selector: BUTTON_LIKE, includeShell },
  );
}

/** Re-find a control after a reload: same index if the name still matches, else first with that name. */
async function locateControl(page: Page, c: Control, includeShell: boolean): Promise<Locator | null> {
  const now = await listControls(page, includeShell);
  const match = now[c.index]?.name === c.name ? now[c.index] : now.find((x) => x.name === c.name && x.tag === c.tag);
  if (!match) return null;
  const handle = await page.evaluateHandle(
    ({ selector, includeShell, index }) => {
      const main = document.querySelector("main");
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((el) => (includeShell ? true : !!main?.contains(el)))
        .filter((el) => {
          if (el.closest("[aria-hidden='true'], [inert]")) return false;
          if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return false;
          // Re-selecting the radio that is already selected is a no-op by design.
          if ((el as HTMLInputElement).type === "radio" && (el as HTMLInputElement).checked) return false;
          if (el.getAttribute("role") === "radio" && el.getAttribute("aria-checked") === "true") return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
        })[index]!;
    },
    { selector: BUTTON_LIKE, includeShell, index: match.index },
  );
  await handle.evaluate((el) => el.setAttribute("data-sweep-target", ""));
  await handle.dispose();
  return page.locator("[data-sweep-target]");
}

/**
 * Activates one control and reports what observably changed, or null.
 * Ignores mutations that are only tooltip plumbing (hover opens a Radix
 * tooltip; that is not the control doing anything).
 */
async function activate(page: Page, target: Locator, tag: string): Promise<string | null> {
  const events: string[] = [];
  const onNav = (f: unknown) => f === page.mainFrame() && events.push("navigation");
  const onDownload = () => events.push("download");
  const onPopup = () => events.push("popup");
  const onChooser = () => events.push("file chooser");
  const onDialog = (d: { dismiss: () => Promise<void> }) => {
    events.push("native dialog");
    void d.dismiss();
  };
  page.on("framenavigated", onNav);
  page.on("download", onDownload);
  page.on("popup", onPopup);
  page.on("filechooser", onChooser);
  page.on("dialog", onDialog);
  try {
    const urlBefore = page.url();
    await target.evaluate((el) => {
      const w = window as unknown as {
        __sweep: { phase: "baseline" | "armed"; baseline: Set<string>; mutations: string[]; target: Element };
      };
      w.__sweep = { phase: "baseline", baseline: new Set(), mutations: [], target: el };
      // Framework plumbing that happens on an idle page (router prefetch
      // <link>/<script> injection, <head> metadata, lazy <img> src) is not an
      // effect of the control.
      const PLUMBING = new Set(["SCRIPT", "LINK", "STYLE", "META", "NEXT-ROUTE-ANNOUNCER", "TEMPLATE"]);
      const isPlumbing = (n: Node) => n instanceof Element && PLUMBING.has(n.tagName);
      const isTooltip = (n: Node | null) =>
        n instanceof Element && (n.matches('[role="tooltip"], [data-radix-popper-content-wrapper]') || !!n.closest('[role="tooltip"]'));
      new MutationObserver((records) => {
        for (const r of records) {
          // Tooltip plumbing: the trigger gains aria-describedby while its tooltip is open.
          if (r.type === "attributes" && (r.attributeName === "data-sweep-target" || r.attributeName === "aria-describedby")) continue;
          if (r.type === "attributes" && r.attributeName === "data-state") {
            const v = (r.target as Element).getAttribute("data-state") ?? "";
            if (/^(closed|delayed-open|instant-open)$/.test(v) && /^(closed|delayed-open|instant-open)$/.test(r.oldValue ?? "")) continue;
          }
          if (isTooltip(r.target)) continue;
          if (r.target instanceof Element && r.target.closest("head")) continue;
          if (r.type === "attributes" && r.target instanceof HTMLImageElement) continue;
          // Chart shapes animating in late (e.g. a <path> width tween) are not an effect of the click.
          if (r.type === "attributes" && r.target instanceof SVGElement && r.target.closest("svg") !== r.target) continue;
          if (
            r.type === "childList" &&
            [...r.addedNodes, ...r.removedNodes].every((n) => isTooltip(n) || isPlumbing(n) || n.nodeType === Node.COMMENT_NODE)
          )
            continue;
          const sig = `${r.type}:${(r.target as Element).tagName ?? "#text"}:${r.attributeName ?? ""}`;
          // Anything the page already did on its own before the click
          // (baseline) doesn't count as the control's effect.
          if (w.__sweep.phase === "baseline") w.__sweep.baseline.add(sig);
          else if (!w.__sweep.baseline.has(sig)) w.__sweep.mutations.push(sig);
        }
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
    });

    // Baseline window: record what the idle page mutates by itself, then arm.
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      (window as unknown as { __sweep: { phase: string } }).__sweep.phase = "armed";
    });

    if (tag === "select") {
      const options = await target.evaluate((el) =>
        [...(el as HTMLSelectElement).options].filter((o) => !o.selected && !o.disabled).map((o) => o.value),
      );
      if (options.length === 0) return "single-option select";
      await target.selectOption(options[0]!);
    } else {
      await target.click({ timeout: 3000 });
    }

    const observed = async (): Promise<string | null> => {
      if (events.length) return events[0]!;
      if (page.url() !== urlBefore) return "url change";
      return page
        .evaluate(() => {
          const w = window as unknown as { __sweep?: { mutations: string[]; target: Element } };
          if (!w.__sweep) return "navigation"; // page replaced
          if (w.__sweep.mutations.length) return `dom (${w.__sweep.mutations[0]})`;
          const a = document.activeElement;
          if (a && a !== document.body && a !== w.__sweep.target && !w.__sweep.target.contains(a)) return "focus moved";
          return null;
        })
        .catch(() => "navigation");
    };
    let effect: string | null = null;
    await expect
      .poll(async () => (effect = await observed()), { timeout: 1500, intervals: [50, 100, 250] })
      .not.toBeNull()
      .catch(() => undefined);
    return effect;
  } finally {
    page.off("framenavigated", onNav);
    page.off("download", onDownload);
    page.off("popup", onPopup);
    page.off("filechooser", onChooser);
    page.off("dialog", onDialog);
  }
}

test("TC-081: every enabled control has an observable effect when activated", async ({ page }) => {
  // QA-005: ~170 full page loads by design; 3.0-3.5 min at 1 worker on an idle
  // machine left <1 min headroom under the old 240s cap. TODO(follow-up): trim
  // the per-control reloads instead of growing this budget again.
  test.setTimeout(480_000);
  // Each control is swept from a fresh load, but sessionStorage outlives a
  // reload in the same tab. Sweeping the top-bar Demo button (TASK-44) leaves
  // the tour's confirm dialog persisted there, and its z-[70] scrim then
  // covers every later control. Clear the tour state on every load so each
  // sweep starts from the same idle page.
  await page.addInitScript(() => {
    try {
      window.sessionStorage.removeItem("verilane-tour");
    } catch {
      // Storage blocked: the tour falls back to memory, which a load resets.
    }
  });
  const dead: string[] = [];
  const log: string[] = [];
  const all = ROUTES;
  for (const [i, href] of all.entries()) {
    const includeShell = i === 0;
    await open(page, href);
    const controls = await listControls(page, includeShell);
    for (const c of controls) {
      const allowed = NO_OP_ALLOW.find((a) => a.route.test(href) && a.name.test(c.name));
      if (allowed) {
        log.push(`${href} · ${c.tag} "${c.name}" → allow-listed: ${allowed.reason}`);
        continue;
      }
      await open(page, href);
      const target = await locateControl(page, c, includeShell);
      if (!target) {
        log.push(`${href} · ${c.tag} "${c.name}" → gone after earlier clicks (not swept)`);
        continue;
      }
      const effect = await activate(page, target, c.tag);
      log.push(`${href} · ${c.tag} "${c.name}" → ${effect ?? "NO EFFECT"}`);
      if (!effect) dead.push(`${href}: ${c.tag} "${c.name}" has no observable effect`);
    }
  }

  // Links: every internal href must load (the navigation is its effect).
  const hrefs = new Set<string>();
  for (const href of all) {
    await open(page, href);
    for (const h of await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
      if (new URL(h).origin === new URL(page.url()).origin) hrefs.add(h.split("#")[0]!);
    }
  }
  for (const h of hrefs) {
    const res = await page.request.get(h);
    log.push(`link ${new URL(h).pathname} → HTTP ${res.status()}`);
    if (res.status() >= 400) dead.push(`link ${h} → HTTP ${res.status()}`);
  }

  try {
    const dir = "/Volumes/E Drive/Dev/.scratch/verilane-qa";
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/TC-081-click-sweep-${test.info().project.name}.txt`, log.join("\n") + "\n");
  } catch {
    // Evidence file is best-effort (the QA dir only exists on the dev machine).
  }
  await test.info().attach("click-sweep.txt", { body: log.join("\n"), contentType: "text/plain" });
  expect(dead, log.join("\n")).toEqual([]);
});
